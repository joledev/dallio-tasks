import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/core/shared/prisma';
import type { Actor } from '@/core/shared/actor';
import { PrismaStatusRepository } from '@/core/statuses/prisma-repository';
import { PrismaParticipantRepository } from '@/core/participants/prisma-repository';
import { assignTask } from './use-cases';
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
const participantRepo = new PrismaParticipantRepository();
const USER_A = randomUUID();
const USER_B = randomUUID();
const BOARD_A = randomUUID();
const BOARD_B = randomUUID();

// Seed the canonical statuses per board; returns slug → id for that board.
async function seedStatuses(boardId: string) {
  const todo = await statusRepo.create({
    boardId,
    name: 'To do',
    slug: 'todo',
    position: 0,
    color: null,
    isDefault: true,
  });
  const done = await statusRepo.create({
    boardId,
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
        { id: USER_A, email: `a-${USER_A}@it.local`, name: 'Owner A' },
        { id: USER_B, email: `b-${USER_B}@it.local`, name: 'Owner B' },
      ],
    });
    await prisma.board.createMany({
      data: [
        { id: BOARD_A, ownerId: USER_A, name: 'Board A', shareToken: `tok-${BOARD_A}` },
        { id: BOARD_B, ownerId: USER_B, name: 'Board B', shareToken: `tok-${BOARD_B}` },
      ],
    });
    aStatus = await seedStatuses(BOARD_A);
    bStatus = await seedStatuses(BOARD_B);
    // Board A: 25 tasks Task-00..Task-24, first 10 done, rest todo; two HIGH priority.
    for (let i = 0; i < 25; i++) {
      await repo.create({
        title: `Task-${String(i).padStart(2, '0')}`,
        description: null,
        statusId: i < 10 ? aStatus.done : aStatus.todo,
        priority: i < 2 ? 'HIGH' : 'MEDIUM',
        boardId: BOARD_A,
        createdByParticipantId: null,
        assigneeParticipantId: null,
      });
    }
    // Board B: one task that A must never see/touch.
    await repo.create({
      title: 'B-secret',
      description: null,
      statusId: bStatus.todo,
      priority: 'LOW',
      boardId: BOARD_B,
      createdByParticipantId: null,
      assigneeParticipantId: null,
    });
  });

  afterAll(async () => {
    // Delete tasks first (Task.statusId is onDelete: Restrict), then statuses, then boards, then users.
    await prisma.task.deleteMany({ where: { boardId: { in: [BOARD_A, BOARD_B] } } });
    await prisma.status.deleteMany({ where: { boardId: { in: [BOARD_A, BOARD_B] } } });
    await prisma.board.deleteMany({ where: { id: { in: [BOARD_A, BOARD_B] } } });
    await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
    await prisma.$disconnect();
  });

  it('filters by statusId in SQL and counts only the filtered set', async () => {
    const { items, total } = await repo.list({
      filter: { boardId: BOARD_A, statusId: aStatus.done },
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
      filter: { boardId: BOARD_A },
      sort: 'title',
      dir: 'asc',
      offset: 0,
      limit: 10,
    });
    expect(page1.items).toHaveLength(10);
    expect(page1.items[0].title).toBe('Task-00'); // offset 0 → first row present
    expect(page1.total).toBe(25);

    const page3 = await repo.list({
      filter: { boardId: BOARD_A },
      sort: 'title',
      dir: 'asc',
      offset: 20,
      limit: 10,
    });
    expect(page3.items).toHaveLength(5);
    expect(page3.items[0].title).toBe('Task-20');

    const beyond = await repo.list({
      filter: { boardId: BOARD_A },
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
      filter: { boardId: BOARD_A },
      sort: 'title',
      dir: 'asc',
      offset: 0,
      limit: 25,
    });
    const desc = await repo.list({
      filter: { boardId: BOARD_A },
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
      filter: { boardId: BOARD_A, q: 'task-0' },
      sort: 'title',
      dir: 'asc',
      offset: 0,
      limit: 100,
    });
    // Task-00..Task-09 (10 rows) match 'task-0' case-insensitively.
    expect(items).toHaveLength(10);
    expect(items.every((t) => t.title.toLowerCase().includes('task-0'))).toBe(true);
  });

  it("IDOR: B's task is invisible to A's list (board-scoped WHERE)", async () => {
    const { items, total } = await repo.list({
      filter: { boardId: BOARD_A },
      sort: 'title',
      dir: 'asc',
      offset: 0,
      limit: 100,
    });
    expect(total).toBe(25); // exactly A's rows, never B's 26th
    expect(items.some((t) => t.title === 'B-secret')).toBe(false);
  });

  it('IDOR: get/update/delete of B-owned task by A is scoped out at the DB', async () => {
    const bTask = await prisma.task.findFirstOrThrow({ where: { boardId: BOARD_B } });

    // A cannot read B's task.
    expect(await repo.get(bTask.id, BOARD_A)).toBeNull();

    // A cannot update B's task; updateMany matches 0 rows → null, and the row is unchanged.
    const upd = await repo.update(bTask.id, BOARD_A, { title: 'hijacked' });
    expect(upd).toBeNull();
    const afterUpd = await prisma.task.findUniqueOrThrow({ where: { id: bTask.id } });
    expect(afterUpd.title).toBe('B-secret');

    // A cannot delete B's task; deleteMany matches 0 rows → false, and the row survives.
    expect(await repo.delete(bTask.id, BOARD_A)).toBe(false);
    expect(await prisma.task.findUnique({ where: { id: bTask.id } })).not.toBeNull();

    // B (the real owner board) can read it.
    expect(await repo.get(bTask.id, BOARD_B)).not.toBeNull();
  });

  // --- L1c-b contract proofs ---------------------------------------------------------------------

  it('post-contract: a Task insert WITHOUT boardId is rejected (boardId NOT NULL)', async () => {
    // Raw INSERT that omits boardId — proves the DB-level NOT NULL added by fase2_boards_contract.
    // (The typed create() can no longer even express a missing boardId.)
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Task" ("id", "title", "statusId", "updatedAt")
        VALUES (${randomUUID()}::uuid, 'no-board', ${aStatus.todo}::uuid, now())`,
    ).rejects.toThrow();
  });

  it('post-contract: a Status insert WITHOUT boardId is rejected (boardId NOT NULL)', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "Status" ("id", "name", "slug", "position", "updatedAt")
        VALUES (${randomUUID()}::uuid, 'No board', 'no_board', 0, now())`,
    ).rejects.toThrow();
  });

  it('assign via a same-board Participant still works (H1 path intact)', async () => {
    const alice = await participantRepo.create({
      boardId: BOARD_A,
      displayName: 'Alice',
      color: null,
      sessionTokenHash: `hash-${randomUUID()}`,
    });
    const task = await prisma.task.findFirstOrThrow({
      where: { boardId: BOARD_A, title: 'Task-00' },
    });
    const actorA: Actor = { boardId: BOARD_A, participantId: alice.id };

    const res = await assignTask(repo, participantRepo, actorA, task.id, {
      assigneeParticipantId: alice.id,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.assigneeParticipantId).toBe(alice.id);

    // Unassign round-trips back to null.
    const cleared = await assignTask(repo, participantRepo, actorA, task.id, {
      assigneeParticipantId: null,
    });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.data.assigneeParticipantId).toBeNull();

    await prisma.participant.delete({ where: { id: alice.id } });
  });
});
