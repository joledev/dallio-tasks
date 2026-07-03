import { describe, it, expect } from 'vitest';
import { InMemoryEventBus } from '@/test/in-memory/event-bus';
import { InMemoryRateLimiter } from '@/test/in-memory/rate-limit';
import { taskCreated } from './events';
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

    expect(replayed.map((e) => e.id)).toEqual(['3', '4', '5']); // ascending, strictly > 2
  });

  it('returns [] when the board has no backlog', async () => {
    const bus = new InMemoryEventBus();
    expect(await bus.replay('unknown-board', '0')).toEqual([]);
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
