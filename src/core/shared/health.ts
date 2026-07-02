import { prisma } from './prisma';

// Readiness ping — keeps prisma out of app/ (the route imports pingDatabase, not the client).
export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
