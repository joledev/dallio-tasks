import { describe, it, expect, vi } from 'vitest';
import { InMemoryEventBus } from '@/test/in-memory/event-bus';
import { InMemoryPresenceStore } from '@/test/in-memory/presence';
import { InMemoryRateLimiter } from '@/test/in-memory/rate-limit';
import { taskCreated } from './events';
import { RedisEventBus } from './redis-event-bus';
import type { Task } from '@/core/tasks/task';

const BOARD = '00000000-0000-4000-8000-00000000000a';
const OTHER_BOARD = '00000000-0000-4000-8000-00000000000b';

const task: Task = {
  id: 'task-1',
  title: 'Ship L2a',
  description: null,
  statusId: 'status-1',
  status: {
    id: 'status-1',
    name: 'To do',
    slug: 'todo',
    color: null,
    position: 0,
    isDefault: true,
  },
  priority: 'MEDIUM',
  boardId: BOARD,
  assigneeParticipantId: null,
  position: 0,
  createdAt: new Date('2020-01-01T00:00:00.000Z'),
  updatedAt: new Date('2020-01-01T00:00:00.000Z'),
};

describe('EventPublisher (in-memory)', () => {
  it('publish assembles the right BoardEvent and stamps a per-board monotonic id', async () => {
    const bus = new InMemoryEventBus();

    const emitted = await bus.publish(BOARD, taskCreated(BOARD, 'participant-7', task));

    expect(emitted).toMatchObject({
      id: '1',
      type: 'task.created',
      boardId: BOARD,
      actorId: 'participant-7',
      data: task,
    });
    expect(typeof emitted.ts).toBe('string');
    expect(bus.published).toHaveLength(1);

    // Second publish on the same board advances the seq; a different board has its own counter.
    const second = await bus.publish(BOARD, taskCreated(BOARD, null, task));
    expect(second.id).toBe('2');
    const otherBoard = await bus.publish(OTHER_BOARD, taskCreated(OTHER_BOARD, null, task));
    expect(otherBoard.id).toBe('1');
  });

  it('fans out live events to subscribers until unsubscribed', async () => {
    const bus = new InMemoryEventBus();
    const seen: string[] = [];
    const unsubscribe = await bus.subscribe(BOARD, (e) => seen.push(e.id));

    await bus.publish(BOARD, taskCreated(BOARD, null, task));
    await unsubscribe();
    await bus.publish(BOARD, taskCreated(BOARD, null, task));

    expect(seen).toEqual(['1']); // the post-unsubscribe event is not delivered
  });
});

describe('EventSubscriber.replay (in-memory)', () => {
  it('returns only events with id > afterId, oldest-first', async () => {
    const bus = new InMemoryEventBus();
    for (let i = 0; i < 5; i++) await bus.publish(BOARD, taskCreated(BOARD, null, task));

    const replayed = await bus.replay(BOARD, '2');

    expect(replayed.events.map((e) => e.id)).toEqual(['3', '4', '5']); // ascending, strictly > 2
    expect(replayed.oldestId).toBe('1');
  });

  it('returns an empty result when the board has no backlog', async () => {
    const bus = new InMemoryEventBus();
    expect(await bus.replay('unknown-board', '0')).toEqual({ events: [], oldestId: null });
  });
});

describe('RedisEventBus seq seeding', () => {
  it('seeds an absent board seq from wall-clock ms before INCR', async () => {
    const client = new FakeRedis();
    const bus = new RedisEventBus(client as never);
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValueOnce(1_000_000);
    const first = await bus.publish(BOARD, taskCreated(BOARD, null, task));

    client.resetSeq(BOARD);
    now.mockReturnValueOnce(2_000_000);
    const afterReset = await bus.publish(BOARD, taskCreated(BOARD, null, task));

    expect(Number(first.id)).toBe(1_000_001);
    expect(Number(afterReset.id)).toBe(2_000_001);
    expect(Number(afterReset.id)).toBeGreaterThan(Number(first.id));
    now.mockRestore();
  });
});

describe('RateLimiter (in-memory)', () => {
  it('allows up to the limit then denies over-cap', async () => {
    const limiter = new InMemoryRateLimiter();

    const first = await limiter.check('join:1.2.3.4', 2, 60);
    expect(first).toEqual({ allowed: true, remaining: 1 });

    const second = await limiter.check('join:1.2.3.4', 2, 60);
    expect(second).toEqual({ allowed: true, remaining: 0 });

    const third = await limiter.check('join:1.2.3.4', 2, 60);
    expect(third).toEqual({ allowed: false, remaining: 0 });
  });

  it('resets after the window elapses', async () => {
    let clock = 1_000_000;
    const limiter = new InMemoryRateLimiter(() => clock);

    await limiter.check('write:pid', 1, 30); // consumes the only slot
    expect((await limiter.check('write:pid', 1, 30)).allowed).toBe(false);

    clock += 30_000; // advance past the 30s window
    expect((await limiter.check('write:pid', 1, 30)).allowed).toBe(true);
  });
});

describe('PresenceStore (in-memory)', () => {
  it('online excludes stale participants, prunes them, and counts non-stale distinct pids', async () => {
    let clock = 100_000;
    const presence = new InMemoryPresenceStore(() => clock);

    await presence.join(BOARD, 'fresh');
    await presence.join(BOARD, 'multi-tab');
    await presence.join(BOARD, 'multi-tab');
    presence.setLastSeen(BOARD, 'stale', clock - 45_000);

    const snapshot = await presence.online(BOARD);
    expect(snapshot).toEqual({
      participantIds: ['fresh', 'multi-tab'],
      onlineCount: 2,
    });

    clock += 1;
    const afterPrune = await presence.online(BOARD);
    expect(afterPrune.participantIds).not.toContain('stale');
    expect(afterPrune.onlineCount).toBe(2);
  });
});

class FakeRedis {
  private readonly kv = new Map<string, string>();
  private readonly lists = new Map<string, string[]>();

  async set(key: string, value: string, mode?: string) {
    if (mode === 'NX' && this.kv.has(key)) return null;
    this.kv.set(key, value);
    return 'OK';
  }

  async incr(key: string) {
    const next = Number(this.kv.get(key) ?? '0') + 1;
    this.kv.set(key, String(next));
    return next;
  }

  async get(key: string) {
    return this.kv.get(key) ?? null;
  }

  multi() {
    const ops: Array<() => void> = [];
    const chain = {
      lpush: (key: string, value: string) => {
        ops.push(() => this.lists.set(key, [value, ...(this.lists.get(key) ?? [])]));
        return chain;
      },
      ltrim: (key: string, start: number, stop: number) => {
        ops.push(() => this.lists.set(key, (this.lists.get(key) ?? []).slice(start, stop + 1)));
        return chain;
      },
      publish: () => chain,
      exec: async () => {
        for (const op of ops) op();
        return [];
      },
    };
    return chain;
  }

  resetSeq(boardId: string) {
    this.kv.delete(`board:${boardId}:seq`);
  }
}
