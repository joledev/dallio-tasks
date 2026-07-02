import { PrismaClient } from '@prisma/client';
import { resetDatabase } from '../prisma/seed-data';

// Bring the DB back to the SEED_TASKS baseline. Each spec file calls this in beforeAll so it is
// independent of what other files (or a previous run) left behind — no run-order coupling.
export async function resetToSeed(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await resetDatabase(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
