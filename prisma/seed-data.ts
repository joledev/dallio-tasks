import type { PrismaClient } from '@prisma/client';

// Fixed owner id so SEED_OWNER_ID stays stable across re-seeds (idempotent single-owner seed).
// Keep in sync with SEED_OWNER_ID in .env / .env.example.
export const OWNER_ID = process.env.SEED_OWNER_ID ?? '00000000-0000-4000-8000-000000000001';

// Fase 2 (L1a): the seed owner's demo board. Fixed id/token so e2e and the L1a expand migration agree
// (the migration hard-codes this same id/token for the SEED owner's per-owner board). `/b/<token>` is
// the guest entry point.
export const SEED_BOARD_ID = '00000000-0000-4000-8000-0000000000b0';
export const SEED_BOARD_TOKEN = 'demo-board-share-token';

const DEMO_USERS = [
  { email: 'ada@dallio.local', name: 'Ada Lovelace' },
  { email: 'linus@dallio.local', name: 'Linus Torvalds' },
] as const;

// Fase 2 (L1a): demo guests on the seed board, fixed ids so re-seeds are idempotent and the seeded
// tasks can reference them. sessionTokenHash stays NULL here (L1b issues the opaque cookie).
export const SEED_PARTICIPANTS = [
  { id: '00000000-0000-4000-8000-0000000000c1', displayName: 'Owner', color: 'blue' },
  { id: '00000000-0000-4000-8000-0000000000c2', displayName: 'Ada Lovelace', color: 'green' },
] as const;

// The 3 canonical statuses, scoped to OWNER_ID + the seed board. Fixed ids so e2e stays stable across
// re-seeds. One default per scope (todo); position is the board-column order; color is a palette token.
export const SEED_STATUSES = [
  {
    id: '00000000-0000-4000-8000-000000000201',
    slug: 'todo',
    name: 'To do',
    position: 0,
    color: null,
    isDefault: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000202',
    slug: 'in_progress',
    name: 'In progress',
    position: 1,
    color: 'blue',
    isDefault: false,
  },
  {
    id: '00000000-0000-4000-8000-000000000203',
    slug: 'done',
    name: 'Done',
    position: 2,
    color: 'green',
    isDefault: false,
  },
] as const;

// The seeded tasks — one per status so the views and board columns have a known shape. `assignee`
// is resolved to a real id at seed time; `statusSlug` is resolved to the board's status id.
// `assignee` maps to assigneeParticipantId(→Participant, populated for the demo board). The legacy
// assigneeId(→User) path was removed in L1c-a.
export const SEED_TASKS = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    title: 'Set up local Postgres',
    description: 'Bring up the docker-compose db and run migrations.',
    statusSlug: 'done',
    priority: 'HIGH',
    assignee: 'owner',
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    title: 'Draft the REST API',
    description: 'Thin route handlers over core use-cases.',
    statusSlug: 'in_progress',
    priority: 'MEDIUM',
    assignee: 'ada',
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    title: 'Write the test matrix',
    description: null,
    statusSlug: 'todo',
    priority: 'LOW',
    assignee: null,
  },
] as const;

export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  // The single owner (actingUserId until the auth bonus).
  await prisma.user.upsert({
    where: { id: OWNER_ID },
    update: { name: 'Owner', email: 'owner@dallio.local' },
    create: { id: OWNER_ID, email: 'owner@dallio.local', name: 'Owner' },
  });

  await Promise.all(
    DEMO_USERS.map((u) =>
      prisma.user.upsert({ where: { email: u.email }, update: { name: u.name }, create: u }),
    ),
  );

  // Fase 2 (L1a): the seed owner's demo board. Upsert by fixed id so an already-migrated DB (whose
  // expand migration created this exact board) is reused rather than duplicated.
  await prisma.board.upsert({
    where: { id: SEED_BOARD_ID },
    update: { ownerId: OWNER_ID, name: 'My Board', shareToken: SEED_BOARD_TOKEN },
    create: {
      id: SEED_BOARD_ID,
      ownerId: OWNER_ID,
      name: 'My Board',
      shareToken: SEED_BOARD_TOKEN,
    },
  });

  // Fase 2 (L1a): demo participants on the seed board (idempotent by fixed id).
  const [ownerParticipant, adaParticipant] = await Promise.all(
    SEED_PARTICIPANTS.map((pt) =>
      prisma.participant.upsert({
        where: { id: pt.id },
        update: { displayName: pt.displayName, color: pt.color, boardId: SEED_BOARD_ID },
        create: { ...pt, boardId: SEED_BOARD_ID },
      }),
    ),
  );
  const assigneeParticipantId = {
    owner: ownerParticipant.id,
    ada: adaParticipant.id,
  } as const;

  // Statuses are board-scoped (L1b cutover — the ownerId column stays in the DB until L1c but the code
  // no longer reads it); upsert by the natural key (boardId, slug) so a fresh DB gets the fixed ids
  // while an already-migrated DB reuses its rows. Resolve each slug to the *actual* row id for the task FK.
  const statusIdBySlug = new Map<string, string>();
  for (const { id, slug, ...status } of SEED_STATUSES) {
    const row = await prisma.status.upsert({
      where: { boardId_slug: { boardId: SEED_BOARD_ID, slug } },
      update: { ...status, boardId: SEED_BOARD_ID },
      create: { id, boardId: SEED_BOARD_ID, slug, ...status },
    });
    statusIdBySlug.set(slug, row.id);
  }

  for (const { assignee, statusSlug, ...task } of SEED_TASKS) {
    const data = {
      ...task,
      boardId: SEED_BOARD_ID,
      statusId: statusIdBySlug.get(statusSlug)!,
      // Fase 2 attribution: creator = the owner participant; assignee mirrored onto the participant FK.
      createdByParticipantId: ownerParticipant.id,
      assigneeParticipantId: assignee ? assigneeParticipantId[assignee] : null,
    };
    const { id, ...rest } = data;
    await prisma.task.upsert({ where: { id }, update: rest, create: data });
  }
}

// Wipe task rows before reseeding so a run starts from exactly the SEED_TASKS state, no matter what
// earlier tests created. Users, boards, participants and statuses are only ever upserted, so they need
// no truncation (deleting statuses would also trip the Task.status Restrict FK).
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.task.deleteMany({});
  await seedDatabase(prisma);
}
