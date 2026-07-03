import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStatusRepository } from '@/test/in-memory/status-repository';
import { createStatus, listStatuses, deleteStatus } from './use-cases';
import { createStatusSchema } from './schema';

const OWNER_A = '00000000-0000-4000-8000-00000000000a';
const OWNER_B = '00000000-0000-4000-8000-00000000000b';

describe('createStatus', () => {
  let repo: InMemoryStatusRepository;
  beforeEach(() => {
    repo = new InMemoryStatusRepository();
  });

  it('slugifies the name and appends position from 0', async () => {
    const res = await createStatus(repo, OWNER_A, createStatusSchema.parse({ name: 'On Hold' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.slug).toBe('on_hold');
    expect(res.data.position).toBe(0);
    expect(res.data.isDefault).toBe(false); // never the default on create
    expect(res.data.color).toBeNull();
  });

  it('appends position = max(position)+1 on each create', async () => {
    await createStatus(repo, OWNER_A, createStatusSchema.parse({ name: 'First' }));
    await createStatus(repo, OWNER_A, createStatusSchema.parse({ name: 'Second' }));
    const third = await createStatus(repo, OWNER_A, createStatusSchema.parse({ name: 'Third' }));
    if (!third.ok) throw new Error('ok');
    expect(third.data.position).toBe(2);
  });

  it('stores a color token when supplied', async () => {
    const res = await createStatus(
      repo,
      OWNER_A,
      createStatusSchema.parse({ name: 'Staging', color: 'violet' }),
    );
    if (!res.ok) throw new Error('ok');
    expect(res.data.color).toBe('violet');
  });

  it('dedupes by slug within an owner → CONFLICT', async () => {
    await createStatus(repo, OWNER_A, createStatusSchema.parse({ name: 'Staging' }));
    const dup = await createStatus(repo, OWNER_A, createStatusSchema.parse({ name: 'staging' }));
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe('CONFLICT');
  });

  it('two different owners may each create "Staging" (scope isolation)', async () => {
    const a = await createStatus(repo, OWNER_A, createStatusSchema.parse({ name: 'Staging' }));
    const b = await createStatus(repo, OWNER_B, createStatusSchema.parse({ name: 'Staging' }));
    expect(a.ok && b.ok).toBe(true);
  });

  it('rejects a name that slugifies to empty → VALIDATION_ERROR', async () => {
    const res = await createStatus(repo, OWNER_A, createStatusSchema.parse({ name: '###' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('listStatuses', () => {
  let repo: InMemoryStatusRepository;
  beforeEach(async () => {
    repo = new InMemoryStatusRepository();
    // Create out of order; list must return by position asc.
    await repo.create({
      ownerId: OWNER_A,
      name: 'Done',
      slug: 'done',
      position: 2,
      color: 'green',
      isDefault: false,
    });
    await repo.create({
      ownerId: OWNER_A,
      name: 'To do',
      slug: 'todo',
      position: 0,
      color: null,
      isDefault: true,
    });
    await repo.create({
      ownerId: OWNER_A,
      name: 'Doing',
      slug: 'doing',
      position: 1,
      color: 'blue',
      isDefault: false,
    });
    await repo.create({
      ownerId: OWNER_B,
      name: 'Secret',
      slug: 'secret',
      position: 0,
      color: null,
      isDefault: true,
    });
  });

  it('returns the owner statuses ordered by position', async () => {
    const res = await listStatuses(repo, OWNER_A);
    if (!res.ok) throw new Error('ok');
    expect(res.data.map((s) => s.slug)).toEqual(['todo', 'doing', 'done']);
  });

  it('is owner-scoped (B never sees A statuses)', async () => {
    const res = await listStatuses(repo, OWNER_B);
    if (!res.ok) throw new Error('ok');
    expect(res.data.map((s) => s.slug)).toEqual(['secret']);
  });
});

describe('deleteStatus', () => {
  let repo: InMemoryStatusRepository;
  let defaultId: string;
  let doingId: string;
  beforeEach(async () => {
    repo = new InMemoryStatusRepository();
    defaultId = (
      await repo.create({
        ownerId: OWNER_A,
        name: 'To do',
        slug: 'todo',
        position: 0,
        color: null,
        isDefault: true,
      })
    ).id;
    doingId = (
      await repo.create({
        ownerId: OWNER_A,
        name: 'Doing',
        slug: 'doing',
        position: 1,
        color: 'blue',
        isDefault: false,
      })
    ).id;
  });

  it('blocks deleting the default status → CONFLICT', async () => {
    const res = await deleteStatus(repo, OWNER_A, defaultId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('CONFLICT');
  });

  it('blocks deleting a status that is in use → CONFLICT', async () => {
    repo.taskCounter = (id) => (id === doingId ? 3 : 0);
    const res = await deleteStatus(repo, OWNER_A, doingId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('CONFLICT');
  });

  it('deletes an unused non-default status', async () => {
    const res = await deleteStatus(repo, OWNER_A, doingId);
    expect(res.ok).toBe(true);
    const after = await listStatuses(repo, OWNER_A);
    if (!after.ok) throw new Error('ok');
    expect(after.data.map((s) => s.slug)).toEqual(['todo']);
  });

  it('missing/foreign id → NOT_FOUND (owner B cannot delete A status)', async () => {
    const res = await deleteStatus(repo, OWNER_B, doingId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND');
  });
});

describe('getDefault resolution', () => {
  it('returns the isDefault row when present', async () => {
    const repo = new InMemoryStatusRepository();
    await repo.create({
      ownerId: OWNER_A,
      name: 'To do',
      slug: 'todo',
      position: 0,
      color: null,
      isDefault: false,
    });
    await repo.create({
      ownerId: OWNER_A,
      name: 'Doing',
      slug: 'doing',
      position: 1,
      color: null,
      isDefault: true,
    });
    const def = await repo.getDefault(OWNER_A);
    expect(def?.slug).toBe('doing');
  });

  it('falls back to the lowest position when no isDefault row', async () => {
    const repo = new InMemoryStatusRepository();
    await repo.create({
      ownerId: OWNER_A,
      name: 'Doing',
      slug: 'doing',
      position: 1,
      color: null,
      isDefault: false,
    });
    await repo.create({
      ownerId: OWNER_A,
      name: 'To do',
      slug: 'todo',
      position: 0,
      color: null,
      isDefault: false,
    });
    const def = await repo.getDefault(OWNER_A);
    expect(def?.slug).toBe('todo'); // lowest position
  });

  it('returns null for an owner with no statuses', async () => {
    const repo = new InMemoryStatusRepository();
    expect(await repo.getDefault(OWNER_A)).toBeNull();
  });
});
