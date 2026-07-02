import { PrismaClient } from '@prisma/client';
import { OWNER_ID, seedDatabase } from './seed-data';

async function runSeed() {
  const prisma = new PrismaClient();
  try {
    await seedDatabase(prisma);
    console.log(`Seeded owner ${OWNER_ID} (owner@dallio.local). SEED_OWNER_ID=${OWNER_ID}`);
  } finally {
    await prisma.$disconnect();
  }
}

runSeed().catch((e) => {
  console.error(e);
  process.exit(1);
});
