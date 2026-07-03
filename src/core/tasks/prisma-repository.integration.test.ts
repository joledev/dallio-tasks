import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/core/shared/prisma';
import { PrismaStatusRepository } from '@/core/statuses/prisma-repository';
import { PrismaTaskRepository } from './prisma-repository';

// --- DB guard: if Postgres is unreachable, skip the whole suite cleanly (no red). ---
// Requires a running Postgres + applied migrations. See docs/engineering/testing.md.
async function canConnect(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
const dbUp = await canConnect();

const repo = new PrismaTaskRepository();
const statusRepo = new PrismaStatusRepository();
const OWNER_A = randomUUID();
const OWNER_B = randomUUID();

// Seed the canonical statuses per owner; returns slug → id for that owner.
async function seedStatuses(ownerId: string) {
  const todo = await statusRepo.create({
    ownerId,
    name: 'To do',
    slug: 'todo',
    position: 0,
    color: null,
    isDefault: true,
  });
  const done = await statusRepo.create({
    ownerId,
    name: 'Done',
    slug: 'done',
    position: 2,
    color: 'green',
    isDefault: false,
  });
  return { todo: todo.id, done: done.id };
}

describe.skipIf(!dbUp)('PrismaTaskRepository (integration — real Postgres)', () => {
  let aStatus: { todo: string; done: string };
  let bStatus: { todo: string; done: string };

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: OWNER_A, email: `a-${OWNER_A}@it.local`, name: 'Owner A' },
        { id: OWNER_B, email: `b-${OWNER_B}@it.local`, name: 'Owner B' },
      ],
    });
    aStatus = await seedStatuses(OWNER_A);
    bStatus = await seedStatuses(OWNER_B);
    // Owner A: 25 tasks Task-00..Task-24, first 10 done, rest todo; two HIGH priority.
    for (let i = 0; i < 25; i++) {
      await repo.create({
        title: `Task-${String(i).padStart(2, '0')}`,
        description: null,
        statusId: i < 10 ? aStatus.done : aStatus.todo,
        priority: i < 2 ? 'HIGH' : 'MEDIUM',
        ownerId: OWNER_A,
        assigneeId: null,
      });
    }
    // Owner B: one task that A must never see/touch.
    await repo.create({
      title: 'B-secret',
      description: null,
      statusId: bStatus.todo,
      priority: 'LOW',
      ownerId: OWNER_B,
      assigneeId: null,
    });
  });

  afterAll(async () => {
    // Delete tasks first (Task.statusId is onDelete: Restrict), then statuses, then users.
    await prisma.task.deleteMany({ where: { ownerId: { in: [OWNER_A, OWNER_B] } } });
    await prisma.status.deleteMany({ where: { ownerId: { in: [OWNER_A, OWNER_B] } } });
    await prisma.user.deleteMany({ where: { id: { in: [OWNER_A, OWNER_B] } } });
    await prisma.$disconnect();
  });

  it('filters by statusId in SQL and counts only the filtered set', async () => {
    const { items, total } = await repo.list({
      filter: { ownerId: OWNER_A, statusId: aStatus.done },
      sort: 'title',
      dir: 'asc',
      offset: 0,
      limit: 100,
    });
    expect(total).toBe(10);
    expect(items).toHaveLength(10);
    expect(items.every((t) => t.status.slug === 'done')).toBe(true);
  });

  it('paginates via LIMIT/OFFSET: page 1 not skipped, filtered total intact', async () => {
    const page1 = await repo.list({
      filter: { ownerId: OWNER_A },
      sort: 'title',
      dir: 'asc',
      offset: 0,
      limit: 10,
    });
    expect(page1.items).toHaveLength(10);
    expect(page1.items[0].title).toBe('Task-00'); // offset 0 → first row present
    expect(page1.total).toBe(25);

    const page3 = await repo.list({
      filter: { ownerId: OWNER_A },
      sort: 'title',
      dir: 'asc',
      offset: 20,
      limit: 10,
    });
    expect(page3.items).toHaveLength(5);
    expect(page3.items[0].title).toBe('Task-20');

    const beyond = await repo.list({
      filter: { ownerId: OWNER_A },
      sort: 'title',
      dir: 'asc',
      offset: 990,
      limit: 10,
    });
    expect(beyond.items).toEqual([]);
    expect(beyond.total).toBe(25); // total is not clamped to the page
  });

  it('orders by an allowlisted column, both directions, in SQL', async () => {
    const asc = await repo.list({
      filter: { ownerId: OWNER_A },
      sort: 'title',
      dir: 'asc',
      offset: 0,
      limit: 25,
    });
    const desc = await repo.list({
      filter: { ownerId: OWNER_A },
      sort: 'title',
      dir: 'desc',
      offset: 0,
      limit: 25,
    });
    expect(asc.items[0].title).toBe('Task-00');
    expect(desc.items[0].title).toBe('Task-24');
  });

  it('case-insensitive q filter runs in SQL', async () => {
    const { items } = await repo.list({
      filter: { ownerId: OWNER_A, q: 'task-0' },
      sort: 'title',
      dir: 'asc',
      offset: 0,
      limit: 100,
    });
    // Task-00..Task-09 (10 rows) match 'task-0' case-insensitively.
    expect(items).toHaveLength(10);
    expect(items.every((t) => t.title.toLowerCase().includes('task-0'))).toBe(true);
  });

  it("IDOR: B's task is invisible to A's list (owner-scoped WHERE)", async () => {
    const { items, total } = await repo.list({
      filter: { ownerId: OWNER_A },
      sort: 'title',
      dir: 'asc',
      offset: 0,
      limit: 100,
    });
    expect(total).toBe(25); // exactly A's rows, never B's 26th
    expect(items.some((t) => t.title === 'B-secret')).toBe(false);
  });

  it('IDOR: get/update/delete of B-owned task by A is scoped out at the DB', async () => {
    const bTask = await prisma.task.findFirstOrThrow({ where: { ownerId: OWNER_B } });

    // A cannot read B's task.
    expect(await repo.get(bTask.id, OWNER_A)).toBeNull();

    // A cannot update B's task; updateMany matches 0 rows → null, and the row is unchanged.
    const upd = await repo.update(bTask.id, OWNER_A, { title: 'hijacked' });
    expect(upd).toBeNull();
    const afterUpd = await prisma.task.findUniqueOrThrow({ where: { id: bTask.id } });
    expect(afterUpd.title).toBe('B-secret');

    // A cannot delete B's task; deleteMany matches 0 rows → false, and the row survives.
    expect(await repo.delete(bTask.id, OWNER_A)).toBe(false);
    expect(await prisma.task.findUnique({ where: { id: bTask.id } })).not.toBeNull();

    // B (the real owner) can read it.
    expect(await repo.get(bTask.id, OWNER_B)).not.toBeNull();
  });
});
