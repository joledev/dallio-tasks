import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/core/shared/prisma';
import { PrismaTaskRepository } from '@/core/tasks/prisma-repository';
import { PrismaStatusRepository } from './prisma-repository';
import { createStatus, listStatuses, deleteStatus } from './use-cases';
import { createStatusSchema } from './schema';

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

const repo = new PrismaStatusRepository();
const taskRepo = new PrismaTaskRepository();
const OWNER_A = randomUUID();
const OWNER_B = randomUUID();

describe.skipIf(!dbUp)('PrismaStatusRepository (integration — real Postgres)', () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: OWNER_A, email: `a-${OWNER_A}@st.local`, name: 'Owner A' },
        { id: OWNER_B, email: `b-${OWNER_B}@st.local`, name: 'Owner B' },
      ],
    });
    // Owner A gets a default "To do" seeded directly (isDefault is never set via the create use-case).
    await repo.create({
      ownerId: OWNER_A,
      name: 'To do',
      slug: 'todo',
      position: 0,
      color: null,
      isDefault: true,
    });
    // Owner B gets its own default so cross-owner isolation is meaningful.
    await repo.create({
      ownerId: OWNER_B,
      name: 'To do',
      slug: 'todo',
      position: 0,
      color: null,
      isDefault: true,
    });
  });

  afterAll(async () => {
    // Tasks first (Task.statusId is onDelete: Restrict), then statuses, then users.
    await prisma.task.deleteMany({ where: { ownerId: { in: [OWNER_A, OWNER_B] } } });
    await prisma.status.deleteMany({ where: { ownerId: { in: [OWNER_A, OWNER_B] } } });
    await prisma.user.deleteMany({ where: { id: { in: [OWNER_A, OWNER_B] } } });
    await prisma.$disconnect();
  });

  it('createStatus appends position and listStatuses returns owner statuses ordered by position', async () => {
    // "To do" is at position 0 (seeded). Two more append at 1 and 2.
    const staging = await createStatus(
      repo,
      OWNER_A,
      createStatusSchema.parse({ name: 'Staging', color: 'violet' }),
    );
    const review = await createStatus(repo, OWNER_A, createStatusSchema.parse({ name: 'Review' }));
    expect(staging.ok && review.ok).toBe(true);
    if (staging.ok) {
      expect(staging.data.position).toBe(1); // append after the seeded default
      expect(staging.data.slug).toBe('staging');
      expect(staging.data.color).toBe('violet');
      expect(staging.data.isDefault).toBe(false); // never default on create
    }
    if (review.ok) expect(review.data.position).toBe(2);

    const list = await listStatuses(repo, OWNER_A);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.data.map((s) => s.slug)).toEqual(['todo', 'staging', 'review']);
    }
  });

  it('dedupes by slug within an owner → CONFLICT (DB @@unique backs the pre-check)', async () => {
    const dup = await createStatus(repo, OWNER_A, createStatusSchema.parse({ name: 'staging' }));
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe('CONFLICT');
  });

  it('getDefault resolves the isDefault row', async () => {
    const def = await repo.getDefault(OWNER_A);
    expect(def).not.toBeNull();
    expect(def?.slug).toBe('todo');
    expect(def?.isDefault).toBe(true);
  });

  it('partial unique index rejects a second default per owner', async () => {
    await expect(
      repo.create({
        ownerId: OWNER_A,
        name: 'Second default',
        slug: 'second_default',
        position: 99,
        color: null,
        isDefault: true,
      }),
    ).rejects.toThrow();
  });

  it('IDOR: owner B never sees owner A statuses, and cannot get/delete them', async () => {
    const bList = await listStatuses(repo, OWNER_B);
    if (!bList.ok) throw new Error('list failed');
    // B only ever sees its own seeded "todo", never A's staging/review.
    expect(bList.data.map((s) => s.slug)).toEqual(['todo']);

    // Fetch one of A's statuses out-of-band, then confirm B is scoped out of it.
    const aStaging = await prisma.status.findFirstOrThrow({
      where: { ownerId: OWNER_A, slug: 'staging' },
    });
    expect(await repo.getById(aStaging.id, OWNER_B)).toBeNull(); // owner-scoped read
    expect(await repo.getById(aStaging.id, OWNER_A)).not.toBeNull(); // real owner sees it

    // B's delete use-case cannot reach A's status → NOT_FOUND (no existence disclosure).
    const del = await deleteStatus(repo, OWNER_B, aStaging.id);
    expect(del.ok).toBe(false);
    if (!del.ok) expect(del.error.code).toBe('NOT_FOUND');
    // The row survives B's attempt.
    expect(await prisma.status.findUnique({ where: { id: aStaging.id } })).not.toBeNull();
  });

  it('deleteStatus is blocked when the status is in use (CONFLICT + onDelete: Restrict belt)', async () => {
    const staging = await prisma.status.findFirstOrThrow({
      where: { ownerId: OWNER_A, slug: 'staging' },
    });
    const task = await taskRepo.create({
      title: 'On staging',
      description: null,
      statusId: staging.id,
      priority: 'MEDIUM',
      ownerId: OWNER_A,
      assigneeId: null,
    });

    // Use-case guard: countTasks > 0 → CONFLICT.
    const guarded = await deleteStatus(repo, OWNER_A, staging.id);
    expect(guarded.ok).toBe(false);
    if (!guarded.ok) expect(guarded.error.code).toBe('CONFLICT');

    // DB belt: even bypassing the guard, Postgres refuses the delete (FK onDelete: Restrict).
    await expect(prisma.status.delete({ where: { id: staging.id } })).rejects.toThrow();

    // Free the status again so the "unused non-default" path below can delete it.
    await prisma.task.delete({ where: { id: task.id } });
  });

  it('deleteStatus is blocked for the default status → CONFLICT', async () => {
    const def = await repo.getDefault(OWNER_A);
    if (!def) throw new Error('expected a default');
    const res = await deleteStatus(repo, OWNER_A, def.id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('CONFLICT');
    // Still present.
    expect(await repo.getById(def.id, OWNER_A)).not.toBeNull();
  });

  it('deleteStatus removes an unused non-default status', async () => {
    const staging = await prisma.status.findFirstOrThrow({
      where: { ownerId: OWNER_A, slug: 'staging' },
    });
    const res = await deleteStatus(repo, OWNER_A, staging.id);
    expect(res.ok).toBe(true);
    expect(await prisma.status.findUnique({ where: { id: staging.id } })).toBeNull();
  });
});
