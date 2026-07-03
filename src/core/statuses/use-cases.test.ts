import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryStatusRepository } from '@/test/in-memory/status-repository';
import { InMemoryEventBus } from '@/test/in-memory/event-bus';
import type { Actor } from '@/core/shared/actor';
import { createStatus, listStatuses, deleteStatus } from './use-cases';
import { createStatusSchema } from './schema';

const BOARD_A = '00000000-0000-4000-8000-00000000000a';
const BOARD_B = '00000000-0000-4000-8000-00000000000b';
const actorA: Actor = { boardId: BOARD_A, participantId: null };
const actorB: Actor = { boardId: BOARD_B, participantId: null };

describe('createStatus', () => {
  let repo: InMemoryStatusRepository;
  beforeEach(() => {
    repo = new InMemoryStatusRepository();
  });

  it('slugifies the name and appends position from 0', async () => {
    const res = await createStatus(repo, actorA, createStatusSchema.parse({ name: 'On Hold' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.slug).toBe('on_hold');
    expect(res.data.position).toBe(0);
    expect(res.data.isDefault).toBe(false); // never the default on create
    expect(res.data.color).toBeNull();
  });

  it('appends position = max(position)+1 on each create', async () => {
    await createStatus(repo, actorA, createStatusSchema.parse({ name: 'First' }));
    await createStatus(repo, actorA, createStatusSchema.parse({ name: 'Second' }));
    const third = await createStatus(repo, actorA, createStatusSchema.parse({ name: 'Third' }));
    if (!third.ok) throw new Error('ok');
    expect(third.data.position).toBe(2);
  });

  it('stores a color token when supplied', async () => {
    const res = await createStatus(
      repo,
      actorA,
      createStatusSchema.parse({ name: 'Staging', color: 'violet' }),
    );
    if (!res.ok) throw new Error('ok');
    expect(res.data.color).toBe('violet');
  });

  it('dedupes by slug within a board → CONFLICT', async () => {
    await createStatus(repo, actorA, createStatusSchema.parse({ name: 'Staging' }));
    const dup = await createStatus(repo, actorA, createStatusSchema.parse({ name: 'staging' }));
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe('CONFLICT');
  });

  it('two different boards may each create "Staging" (scope isolation)', async () => {
    const a = await createStatus(repo, actorA, createStatusSchema.parse({ name: 'Staging' }));
    const b = await createStatus(repo, actorB, createStatusSchema.parse({ name: 'Staging' }));
    expect(a.ok && b.ok).toBe(true);
  });

  it('rejects a name that slugifies to empty → VALIDATION_ERROR', async () => {
    const res = await createStatus(repo, actorA, createStatusSchema.parse({ name: '###' }));
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
      boardId: BOARD_A,
      name: 'Done',
      slug: 'done',
      position: 2,
      color: 'green',
      isDefault: false,
    });
    await repo.create({
      boardId: BOARD_A,
      name: 'To do',
      slug: 'todo',
      position: 0,
      color: null,
      isDefault: true,
    });
    await repo.create({
      boardId: BOARD_A,
      name: 'Doing',
      slug: 'doing',
      position: 1,
      color: 'blue',
      isDefault: false,
    });
    await repo.create({
      boardId: BOARD_B,
      name: 'Secret',
      slug: 'secret',
      position: 0,
      color: null,
      isDefault: true,
    });
  });

  it('returns the board statuses ordered by position', async () => {
    const res = await listStatuses(repo, actorA);
    if (!res.ok) throw new Error('ok');
    expect(res.data.map((s) => s.slug)).toEqual(['todo', 'doing', 'done']);
  });

  it('is board-scoped (B never sees A statuses)', async () => {
    const res = await listStatuses(repo, actorB);
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
        boardId: BOARD_A,
        name: 'To do',
        slug: 'todo',
        position: 0,
        color: null,
        isDefault: true,
      })
    ).id;
    doingId = (
      await repo.create({
        boardId: BOARD_A,
        name: 'Doing',
        slug: 'doing',
        position: 1,
        color: 'blue',
        isDefault: false,
      })
    ).id;
  });

  it('blocks deleting the default status → CONFLICT', async () => {
    const res = await deleteStatus(repo, actorA, defaultId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('CONFLICT');
  });

  it('blocks deleting a status that is in use → CONFLICT', async () => {
    repo.taskCounter = (id) => (id === doingId ? 3 : 0);
    const res = await deleteStatus(repo, actorA, doingId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('CONFLICT');
  });

  it('deletes an unused non-default status', async () => {
    const res = await deleteStatus(repo, actorA, doingId);
    expect(res.ok).toBe(true);
    const after = await listStatuses(repo, actorA);
    if (!after.ok) throw new Error('ok');
    expect(after.data.map((s) => s.slug)).toEqual(['todo']);
  });

  it('missing/foreign id → NOT_FOUND (board B cannot delete A status)', async () => {
    const res = await deleteStatus(repo, actorB, doingId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND');
  });
});

describe('status use-cases — realtime event emission', () => {
  let repo: InMemoryStatusRepository;
  let bus: InMemoryEventBus;
  const actor: Actor = { boardId: BOARD_A, participantId: randomUUID() };

  beforeEach(() => {
    repo = new InMemoryStatusRepository();
    bus = new InMemoryEventBus();
  });

  it('emits status.created with the created StatusRef', async () => {
    const res = await createStatus(repo, actor, createStatusSchema.parse({ name: 'On Hold' }), bus);
    await Promise.resolve();

    expect(res.ok).toBe(true);
    expect(bus.published).toHaveLength(1);
    expect(bus.published[0]).toMatchObject({
      type: 'status.created',
      boardId: BOARD_A,
      actorId: actor.participantId,
    });
    if (res.ok)
      expect(bus.published[0].data).toMatchObject({
        id: res.data.id,
        name: 'On Hold',
        slug: 'on_hold',
      });
  });

  it('emits status.deleted with only the status id', async () => {
    await repo.create({
      boardId: BOARD_A,
      name: 'To do',
      slug: 'todo',
      position: 0,
      color: null,
      isDefault: true,
    });
    const doing = await repo.create({
      boardId: BOARD_A,
      name: 'Doing',
      slug: 'doing',
      position: 1,
      color: 'blue',
      isDefault: false,
    });

    const res = await deleteStatus(repo, actor, doing.id, bus);
    await Promise.resolve();

    expect(res.ok).toBe(true);
    expect(bus.published).toHaveLength(1);
    expect(bus.published[0]).toMatchObject({
      type: 'status.deleted',
      boardId: BOARD_A,
      actorId: actor.participantId,
      data: { id: doing.id },
    });
  });

  it('does not emit when the create/delete is rejected', async () => {
    await createStatus(repo, actor, createStatusSchema.parse({ name: 'Staging' }), bus);
    // Duplicate slug → CONFLICT, no second event.
    const dup = await createStatus(repo, actor, createStatusSchema.parse({ name: 'staging' }), bus);
    expect(dup.ok).toBe(false);
    expect(bus.published).toHaveLength(1);
    expect(bus.published.map((event) => event.type)).toEqual(['status.created']);
  });

  it('does not fail the mutation when publish fails', async () => {
    const failingBus = {
      publish: async () => {
        throw new Error('publish failed');
      },
    };

    const res = await createStatus(
      repo,
      actor,
      createStatusSchema.parse({ name: 'Resilient' }),
      failingBus,
    );
    await Promise.resolve();

    expect(res.ok).toBe(true);
    const after = await listStatuses(repo, actor);
    if (!after.ok) throw new Error('ok');
    expect(after.data.map((s) => s.slug)).toContain('resilient');
  });
});

describe('getDefault resolution', () => {
  it('returns the isDefault row when present', async () => {
    const repo = new InMemoryStatusRepository();
    await repo.create({
      boardId: BOARD_A,
      name: 'To do',
      slug: 'todo',
      position: 0,
      color: null,
      isDefault: false,
    });
    await repo.create({
      boardId: BOARD_A,
      name: 'Doing',
      slug: 'doing',
      position: 1,
      color: null,
      isDefault: true,
    });
    const def = await repo.getDefault(BOARD_A);
    expect(def?.slug).toBe('doing');
  });

  it('falls back to the lowest position when no isDefault row', async () => {
    const repo = new InMemoryStatusRepository();
    await repo.create({
      boardId: BOARD_A,
      name: 'Doing',
      slug: 'doing',
      position: 1,
      color: null,
      isDefault: false,
    });
    await repo.create({
      boardId: BOARD_A,
      name: 'To do',
      slug: 'todo',
      position: 0,
      color: null,
      isDefault: false,
    });
    const def = await repo.getDefault(BOARD_A);
    expect(def?.slug).toBe('todo'); // lowest position
  });

  it('returns null for a board with no statuses', async () => {
    const repo = new InMemoryStatusRepository();
    expect(await repo.getDefault(BOARD_A)).toBeNull();
  });
});
