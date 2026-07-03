import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/core/shared/prisma';
import type { Actor } from '@/core/shared/actor';
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
const USER_A = randomUUID();
const USER_B = randomUUID();
const BOARD_A = randomUUID();
const BOARD_B = randomUUID();
const actorA: Actor = { boardId: BOARD_A, participantId: null };
const actorB: Actor = { boardId: BOARD_B, participantId: null };

describe.skipIf(!dbUp)('PrismaStatusRepository (integration — real Postgres)', () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: USER_A, email: `a-${USER_A}@st.local`, name: 'Owner A' },
        { id: USER_B, email: `b-${USER_B}@st.local`, name: 'Owner B' },
      ],
    });
    await prisma.board.createMany({
      data: [
        { id: BOARD_A, ownerId: USER_A, name: 'Board A', shareToken: `tok-${BOARD_A}` },
        { id: BOARD_B, ownerId: USER_B, name: 'Board B', shareToken: `tok-${BOARD_B}` },
      ],
    });
    // Board A gets a default "To do" seeded directly (isDefault is never set via the create use-case).
    await repo.create({
      boardId: BOARD_A,
      name: 'To do',
      slug: 'todo',
      position: 0,
      color: null,
      isDefault: true,
    });
    // Board B gets its own default so cross-board isolation is meaningful.
    await repo.create({
      boardId: BOARD_B,
      name: 'To do',
      slug: 'todo',
      position: 0,
      color: null,
      isDefault: true,
    });
  });

  afterAll(async () => {
    // Tasks first (Task.statusId is onDelete: Restrict), then statuses, then boards, then users.
    await prisma.task.deleteMany({ where: { boardId: { in: [BOARD_A, BOARD_B] } } });
    await prisma.status.deleteMany({ where: { boardId: { in: [BOARD_A, BOARD_B] } } });
    await prisma.board.deleteMany({ where: { id: { in: [BOARD_A, BOARD_B] } } });
    await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
    await prisma.$disconnect();
  });

  it('createStatus appends position and listStatuses returns board statuses ordered by position', async () => {
    // "To do" is at position 0 (seeded). Two more append at 1 and 2.
    const staging = await createStatus(
      repo,
      actorA,
      createStatusSchema.parse({ name: 'Staging', color: 'violet' }),
    );
    const review = await createStatus(repo, actorA, createStatusSchema.parse({ name: 'Review' }));
    expect(staging.ok && review.ok).toBe(true);
    if (staging.ok) {
      expect(staging.data.position).toBe(1); // append after the seeded default
      expect(staging.data.slug).toBe('staging');
      expect(staging.data.color).toBe('violet');
      expect(staging.data.isDefault).toBe(false); // never default on create
    }
    if (review.ok) expect(review.data.position).toBe(2);

    const list = await listStatuses(repo, actorA);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.data.map((s) => s.slug)).toEqual(['todo', 'staging', 'review']);
    }
  });

  it('dedupes by slug within a board → CONFLICT (DB @@unique backs the pre-check)', async () => {
    const dup = await createStatus(repo, actorA, createStatusSchema.parse({ name: 'staging' }));
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe('CONFLICT');
  });

  it('getDefault resolves the isDefault row', async () => {
    const def = await repo.getDefault(BOARD_A);
    expect(def).not.toBeNull();
    expect(def?.slug).toBe('todo');
    expect(def?.isDefault).toBe(true);
  });

  it('partial unique index rejects a second default per board', async () => {
    await expect(
      repo.create({
        boardId: BOARD_A,
        name: 'Second default',
        slug: 'second_default',
        position: 99,
        color: null,
        isDefault: true,
      }),
    ).rejects.toThrow();
  });

  it('IDOR: board B never sees board A statuses, and cannot get/delete them', async () => {
    const bList = await listStatuses(repo, actorB);
    if (!bList.ok) throw new Error('list failed');
    // B only ever sees its own seeded "todo", never A's staging/review.
    expect(bList.data.map((s) => s.slug)).toEqual(['todo']);

    // Fetch one of A's statuses out-of-band, then confirm B is scoped out of it.
    const aStaging = await prisma.status.findFirstOrThrow({
      where: { boardId: BOARD_A, slug: 'staging' },
    });
    expect(await repo.getById(aStaging.id, BOARD_B)).toBeNull(); // board-scoped read
    expect(await repo.getById(aStaging.id, BOARD_A)).not.toBeNull(); // real board sees it

    // B's delete use-case cannot reach A's status → NOT_FOUND (no existence disclosure).
    const del = await deleteStatus(repo, actorB, aStaging.id);
    expect(del.ok).toBe(false);
    if (!del.ok) expect(del.error.code).toBe('NOT_FOUND');
    // The row survives B's attempt.
    expect(await prisma.status.findUnique({ where: { id: aStaging.id } })).not.toBeNull();
  });

  it('deleteStatus is blocked when the status is in use (CONFLICT + onDelete: Restrict belt)', async () => {
    const staging = await prisma.status.findFirstOrThrow({
      where: { boardId: BOARD_A, slug: 'staging' },
    });
    const task = await taskRepo.create({
      title: 'On staging',
      description: null,
      statusId: staging.id,
      priority: 'MEDIUM',
      boardId: BOARD_A,
      createdByParticipantId: null,
      assigneeId: null,
    });

    // Use-case guard: countTasks > 0 → CONFLICT.
    const guarded = await deleteStatus(repo, actorA, staging.id);
    expect(guarded.ok).toBe(false);
    if (!guarded.ok) expect(guarded.error.code).toBe('CONFLICT');

    // DB belt: even bypassing the guard, Postgres refuses the delete (FK onDelete: Restrict).
    await expect(prisma.status.delete({ where: { id: staging.id } })).rejects.toThrow();

    // Free the status again so the "unused non-default" path below can delete it.
    await prisma.task.delete({ where: { id: task.id } });
  });

  it('deleteStatus is blocked for the default status → CONFLICT', async () => {
    const def = await repo.getDefault(BOARD_A);
    if (!def) throw new Error('expected a default');
    const res = await deleteStatus(repo, actorA, def.id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('CONFLICT');
    // Still present.
    expect(await repo.getById(def.id, BOARD_A)).not.toBeNull();
  });

  it('deleteStatus removes an unused non-default status', async () => {
    const staging = await prisma.status.findFirstOrThrow({
      where: { boardId: BOARD_A, slug: 'staging' },
    });
    const res = await deleteStatus(repo, actorA, staging.id);
    expect(res.ok).toBe(true);
    expect(await prisma.status.findUnique({ where: { id: staging.id } })).toBeNull();
  });
});
