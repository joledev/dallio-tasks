import type { EventBus, ReplayResult, Unsubscribe } from '@/core/realtime/event-bus';
import type { BoardEvent, NewBoardEvent } from '@/core/realtime/events';

// In-memory EventBus built to the same port contract, for unit tests (no Redis). Mirrors the Redis
// adapter's semantics: per-board monotonic id, a capped oldest-first log for replay, and synchronous
// fan-out to subscribers. `published` is a test-only tap over every emitted event, in emission order.
const LOG_CAP = 999;

export class InMemoryEventBus implements EventBus {
  private readonly seqs = new Map<string, number>();
  private readonly logs = new Map<string, BoardEvent[]>();
  private readonly subscribers = new Map<string, Set<(event: BoardEvent) => void>>();

  // Every event ever published, in order — assertion surface for tests.
  readonly published: BoardEvent[] = [];

  async publish(boardId: string, event: NewBoardEvent): Promise<BoardEvent> {
    const id = (this.seqs.get(boardId) ?? 0) + 1;
    this.seqs.set(boardId, id);
    const full = { ...event, id: String(id) } as BoardEvent;

    const log = this.logs.get(boardId) ?? [];
    log.push(full); // oldest-first
    if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP);
    this.logs.set(boardId, log);

    this.published.push(full);
    this.subscribers.get(boardId)?.forEach((fn) => fn(full));
    return full;
  }

  async subscribe(boardId: string, onEvent: (event: BoardEvent) => void): Promise<Unsubscribe> {
    const set = this.subscribers.get(boardId) ?? new Set();
    set.add(onEvent);
    this.subscribers.set(boardId, set);
    return () => {
      set.delete(onEvent);
    };
  }

  async replay(boardId: string, afterId: string): Promise<ReplayResult> {
    const after = Number(afterId);
    const events = this.logs.get(boardId) ?? [];
    return {
      events: events.filter((e) => Number(e.id) > after),
      oldestId: events[0]?.id ?? null,
    };
  }

  async getCurrentSeq(boardId: string): Promise<string | null> {
    const seq = this.seqs.get(boardId);
    return seq === undefined ? null : String(seq);
  }
}
