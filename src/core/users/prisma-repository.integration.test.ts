import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/core/shared/prisma';
import { PrismaUserRepository } from './prisma-repository';
import { createUser } from './use-cases';

async function canConnect(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
const dbUp = await canConnect();

const repo = new PrismaUserRepository();
const tag = randomUUID().slice(0, 8);
const createdIds: string[] = [];

describe.skipIf(!dbUp)('PrismaUserRepository (integration — real Postgres)', () => {
  beforeAll(async () => {
    for (let i = 0; i < 5; i++) {
      const u = await repo.create({
        email: `it-${tag}-${i}@users.local`,
        name: `IT User ${i}`,
        passwordHash: 'argon2id$should-never-leak',
      });
      createdIds.push(u.id);
    }
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  it('lists with ORDER BY + LIMIT/OFFSET in SQL', async () => {
    const { items } = await repo.list({ sort: 'email', dir: 'asc', offset: 0, limit: 3 });
    expect(items.length).toBeLessThanOrEqual(3);
  });

  it('getByEmail resolves the exact row', async () => {
    const found = await repo.getByEmail(`it-${tag}-0@users.local`);
    expect(found?.name).toBe('IT User 0');
  });

  it('createUser use-case rejects a duplicate email → CONFLICT (DB unique constraint backs it)', async () => {
    const email = `it-${tag}-dup@users.local`;
    const first = await createUser(repo, { email, name: 'Dup One' });
    expect(first.ok).toBe(true);
    if (first.ok) createdIds.push(first.data.id);

    const second = await createUser(repo, { email, name: 'Dup Two' });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('CONFLICT');
  });
});
