import { PrismaClient } from '@prisma/client';

// HMR-safe singleton: reuse the client across dev reloads instead of exhausting connections.
// This is the one module allowed to import PrismaClient; repositories and health.ts import { prisma }
// from here, and the ESLint boundary bars src/app/** from touching it.
declare global {
  var __prisma: PrismaClient | undefined;
}

export const prisma = global.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;
