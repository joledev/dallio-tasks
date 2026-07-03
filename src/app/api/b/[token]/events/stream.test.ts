import { describe, expect, it, vi } from 'vitest';
import { InMemoryEventBus } from '@/test/in-memory/event-bus';
import type { EventBus, Unsubscribe } from '@/core/realtime/event-bus';
import type { BoardEvent, NewBoardEvent } from '@/core/realtime/events';
import { taskCreated, taskUpdated } from '@/core/realtime/events';
import type { Task } from '@/core/tasks/task';
import { createBoardEventStream, frameBoardEvent, shouldRefreshForCursor } from './stream';

const BOARD = '00000000-0000-4000-8000-00000000000a';

const task: Task = {
  id: 'task-1',
  title: 'Live task',
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

async function readChunks(stream: ReadableStream<Uint8Array>, count: number): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  try {
    for (let i = 0; i < count; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      out += decoder.decode(value);
    }
  } finally {
    await reader.cancel();
  }
  return out;
}

describe('SSE stream framing/replay helpers', () => {
  it('frames BoardEvent with id, event, and JSON data lines', async () => {
    const bus = new InMemoryEventBus();
    const event = await bus.publish(BOARD, taskCreated(BOARD, 'p1', task));

    expect(frameBoardEvent(event)).toBe(
      `id: 1\nevent: task.created\ndata: ${JSON.stringify(event)}\n\n`,
    );
  });

  it('replays only events after Last-Event-ID', async () => {
    const bus = new InMemoryEventBus();
    await bus.publish(BOARD, taskCreated(BOARD, null, task));
    await bus.publish(BOARD, taskUpdated(BOARD, null, { ...task, title: 'two' }));
    await bus.publish(BOARD, taskUpdated(BOARD, null, { ...task, title: 'three' }));

    const text = await readChunks(createBoardEventStream(bus, BOARD, '1', 60_000), 2);

    expect(text).not.toContain('id: 1\n');
    expect(text).toContain('id: 2\n');
    expect(text).toContain('id: 3\n');
  });

  it('dedupes live events that arrive before replay flushes', async () => {
    const replayed = [
      { ...taskUpdated(BOARD, null, { ...task, title: 'two' }), id: '2' } as BoardEvent,
      { ...taskUpdated(BOARD, null, { ...task, title: 'three' }), id: '3' } as BoardEvent,
    ];
    const bus: EventBus = {
      publish: async (_boardId: string, event: NewBoardEvent) =>
        ({ ...event, id: '4' }) as BoardEvent,
      subscribe: async (
        _boardId: string,
        onEvent: (event: BoardEvent) => void,
      ): Promise<Unsubscribe> => {
        onEvent(replayed[0]);
        return () => undefined;
      },
      replay: async () => ({ events: replayed, oldestId: '2' }),
      getCurrentSeq: async () => '3',
    };

    const text = await readChunks(createBoardEventStream(bus, BOARD, '1', 60_000), 2);

    expect(text.match(/id: 2\n/g)).toHaveLength(1);
    expect(text.match(/id: 3\n/g)).toHaveLength(1);
  });

  it('signals refresh instead of partial replay when the retained backlog starts after the cursor', async () => {
    const replayed = [
      { ...taskUpdated(BOARD, null, { ...task, title: 'five' }), id: '5' } as BoardEvent,
      { ...taskUpdated(BOARD, null, { ...task, title: 'six' }), id: '6' } as BoardEvent,
    ];
    const bus: EventBus = {
      publish: async (_boardId: string, event: NewBoardEvent) =>
        ({ ...event, id: '7' }) as BoardEvent,
      subscribe: async () => () => undefined,
      replay: async () => ({ events: replayed, oldestId: '5' }),
      getCurrentSeq: async () => '6',
    };

    const text = await readChunks(createBoardEventStream(bus, BOARD, '2', 60_000), 1);

    expect(text).toBe('event: refresh\ndata: {}\n\n');
  });

  it('unsubscribes when the stream is canceled while subscribe is still pending', async () => {
    const unsubscribe = vi.fn();
    let resolveSubscribe: ((unsubscribe: Unsubscribe) => void) | undefined;
    const bus: EventBus = {
      publish: async (_boardId: string, event: NewBoardEvent) =>
        ({ ...event, id: '1' }) as BoardEvent,
      subscribe: async () =>
        new Promise<Unsubscribe>((resolve) => {
          resolveSubscribe = resolve;
        }),
      replay: async () => ({ events: [], oldestId: null }),
      getCurrentSeq: async () => '0',
    };
    const stream = createBoardEventStream(bus, BOARD, '0', 60_000);
    const reader = stream.getReader();

    await reader.cancel();
    resolveSubscribe?.(unsubscribe);
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
  });

  it('signals refresh when Last-Event-ID is above the current board seq', async () => {
    const bus = new InMemoryEventBus();
    await bus.publish(BOARD, taskCreated(BOARD, null, task));

    await expect(shouldRefreshForCursor(bus, BOARD, '999')).resolves.toBe(true);
    const text = await readChunks(createBoardEventStream(bus, BOARD, '999', 60_000), 1);

    expect(text).toBe('event: refresh\ndata: {}\n\n');
  });
});
