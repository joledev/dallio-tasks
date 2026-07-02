import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryUserRepository } from '@/test/in-memory/user-repository';
import { createUser, listUsers } from './use-cases';
import { createUserSchema, listUsersQuerySchema } from './schema';
import { toPublicUser } from './user';

describe('toPublicUser', () => {
  it('strips passwordHash', () => {
    const pub = toPublicUser({
      id: 'u1',
      email: 'x@y.io',
      name: 'X',
      passwordHash: 'argon2id$secret',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect('passwordHash' in pub).toBe(false);
    expect(pub.email).toBe('x@y.io');
  });
});

describe('createUser', () => {
  let repo: InMemoryUserRepository;
  beforeEach(() => {
    repo = new InMemoryUserRepository();
  });

  it('creates a user and never returns passwordHash', async () => {
    const res = await createUser(repo, { email: 'new@dallio.io', name: 'New' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect('passwordHash' in res.data).toBe(false);
    expect(res.data.email).toBe('new@dallio.io');
  });

  it('lowercases and trims the email at the schema boundary', async () => {
    // Validation/normalization now lives solely at the schema (the route boundary); the use-case
    // takes pre-typed input. Exercise the boundary via the schema, then hand off to createUser.
    const input = createUserSchema.parse({ email: '  MixedCase@Dallio.IO  ', name: '  Jo  ' });
    const res = await createUser(repo, input);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.email).toBe('mixedcase@dallio.io');
    expect(res.data.name).toBe('Jo');
  });

  it('duplicate email → CONFLICT', async () => {
    await createUser(repo, createUserSchema.parse({ email: 'dup@dallio.io', name: 'First' }));
    const res = await createUser(
      repo,
      createUserSchema.parse({ email: 'dup@dallio.io', name: 'Second' }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('CONFLICT');
  });

  it('duplicate detection is case-insensitive (email normalized first)', async () => {
    await createUser(repo, createUserSchema.parse({ email: 'case@dallio.io', name: 'First' }));
    const res = await createUser(
      repo,
      createUserSchema.parse({ email: 'CASE@DALLIO.IO', name: 'Second' }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('CONFLICT');
  });

  it('invalid email → VALIDATION_ERROR at the schema boundary', () => {
    // The use-case no longer re-validates; the schema is the validation boundary (rejected pre-createUser).
    const parsed = createUserSchema.safeParse({ email: 'not-an-email', name: 'X' });
    expect(parsed.success).toBe(false);
  });
});

describe('listUsers', () => {
  let repo: InMemoryUserRepository;
  beforeEach(async () => {
    repo = new InMemoryUserRepository();
    for (let i = 0; i < 25; i++) {
      await repo.create({
        email: `u${String(i).padStart(2, '0')}@dallio.io`,
        name: `User-${String(i).padStart(2, '0')}`,
        passwordHash: 'secret-hash',
      });
    }
  });

  it('never leaks passwordHash in the listing', async () => {
    const res = await listUsers(repo, listUsersQuerySchema.parse({}));
    if (!res.ok) throw new Error('ok');
    expect(res.data.items.every((u) => !('passwordHash' in u))).toBe(true);
  });

  it('paginates: page=1 offset 0, correct total, size cap', async () => {
    const res = await listUsers(
      repo,
      listUsersQuerySchema.parse({ sort: 'name', dir: 'asc', page: 1, size: 10 }),
    );
    if (!res.ok) throw new Error('ok');
    expect(res.data.items).toHaveLength(10);
    expect(res.data.items[0].name).toBe('User-00');
    expect(res.data.total).toBe(25);
  });

  it('out-of-range page → empty items, full total', async () => {
    const res = await listUsers(repo, listUsersQuerySchema.parse({ page: 99, size: 10 }));
    if (!res.ok) throw new Error('ok');
    expect(res.data.items).toEqual([]);
    expect(res.data.total).toBe(25);
  });

  it('unknown sort field is rejected by the allowlist (defaults on absence)', () => {
    expect(listUsersQuerySchema.safeParse({ sort: 'passwordHash' }).success).toBe(false);
    expect(listUsersQuerySchema.parse({}).sort).toBe('createdAt');
  });

  it('rejects size over the max', () => {
    expect(listUsersQuerySchema.safeParse({ size: 500 }).success).toBe(false);
  });
});
