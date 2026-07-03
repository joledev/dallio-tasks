import type { PrismaClient } from '@prisma/client';

// Fixed owner id so SEED_OWNER_ID stays stable across re-seeds (idempotent single-owner seed).
// Keep in sync with SEED_OWNER_ID in .env / .env.example.
export const OWNER_ID = process.env.SEED_OWNER_ID ?? '00000000-0000-4000-8000-000000000001';

const DEMO_USERS = [
  { email: 'ada@dallio.local', name: 'Ada Lovelace' },
  { email: 'linus@dallio.local', name: 'Linus Torvalds' },
] as const;

// The 3 canonical statuses, scoped to OWNER_ID. Fixed ids so e2e stays stable across re-seeds.
// One default per owner (todo); position is the board-column order; color is a palette token.
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
// is resolved to a real id at seed time; `statusSlug` is resolved to the owner's status id.
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

  const [ada] = await Promise.all(
    DEMO_USERS.map((u) =>
      prisma.user.upsert({ where: { email: u.email }, update: { name: u.name }, create: u }),
    ),
  );

  const assigneeId = { owner: OWNER_ID, ada: ada.id } as const;

  // Statuses are owner-scoped; upsert by the natural key (ownerId, slug) so a fresh DB gets the fixed
  // ids while an already-migrated DB (statuses seeded by the migration) reuses its existing rows.
  // Resolve each slug to the *actual* row id for the task FK, whichever path created it.
  const statusIdBySlug = new Map<string, string>();
  for (const { id, slug, ...status } of SEED_STATUSES) {
    const row = await prisma.status.upsert({
      where: { ownerId_slug: { ownerId: OWNER_ID, slug } },
      update: { ...status },
      create: { id, ownerId: OWNER_ID, slug, ...status },
    });
    statusIdBySlug.set(slug, row.id);
  }

  for (const { assignee, statusSlug, ...task } of SEED_TASKS) {
    const data = {
      ...task,
      ownerId: OWNER_ID,
      statusId: statusIdBySlug.get(statusSlug)!,
      assigneeId: assignee ? assigneeId[assignee] : null,
    };
    const { id, ...rest } = data;
    await prisma.task.upsert({ where: { id }, update: rest, create: data });
  }
}

// Wipe task rows before reseeding so a run starts from exactly the SEED_TASKS state, no matter what
// earlier tests created. Users and statuses are only ever upserted, so they need no truncation
// (deleting statuses would also trip the Task.status Restrict FK).
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.task.deleteMany({});
  await seedDatabase(prisma);
}
