import type { PrismaClient } from '@prisma/client';

// Fixed owner id so SEED_OWNER_ID stays stable across re-seeds (idempotent single-owner seed).
// Keep in sync with SEED_OWNER_ID in .env / .env.example.
export const OWNER_ID = process.env.SEED_OWNER_ID ?? '00000000-0000-4000-8000-000000000001';

const DEMO_USERS = [
  { email: 'ada@dallio.local', name: 'Ada Lovelace' },
  { email: 'linus@dallio.local', name: 'Linus Torvalds' },
] as const;

// The seeded tasks — one per status so the views and board columns have a known shape. `assignee`
// is resolved to a real id at seed time; e2e tests derive their expectations from this table.
export const SEED_TASKS = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    title: 'Set up local Postgres',
    description: 'Bring up the docker-compose db and run migrations.',
    status: 'DONE',
    priority: 'HIGH',
    assignee: 'owner',
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    title: 'Draft the REST API',
    description: 'Thin route handlers over core use-cases.',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    assignee: 'ada',
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    title: 'Write the test matrix',
    description: null,
    status: 'TODO',
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

  for (const { assignee, ...task } of SEED_TASKS) {
    const data = {
      ...task,
      ownerId: OWNER_ID,
      assigneeId: assignee ? assigneeId[assignee] : null,
    };
    const { id, ...rest } = data;
    await prisma.task.upsert({ where: { id }, update: rest, create: data });
  }
}

// Wipe task rows before reseeding so a run starts from exactly the SEED_TASKS state, no matter what
// earlier tests created. Users are only ever upserted, so they need no truncation.
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.task.deleteMany({});
  await seedDatabase(prisma);
}
