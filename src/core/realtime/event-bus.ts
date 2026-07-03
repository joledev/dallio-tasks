import type { BoardEvent, NewBoardEvent } from './events';

// PORT interfaces (freeze-first, gates L2). Core/use-cases depend on these — never on Redis — exactly
// like the repository ports. `container.ts` wires the concrete Redis-backed implementation.

export type Unsubscribe = () => void | Promise<void>;

export interface EventPublisher {
  // Assigns the per-board monotonic id, persists to the replay log, and fans out. Returns the fully
  // assembled event (with its `id`). Callers may fire-and-forget: a publish failure must not fail the
  // mutation that triggered it (the DB write already happened).
  publish(boardId: string, event: NewBoardEvent): Promise<BoardEvent>;
}

export interface EventSubscriber {
  // Live fan-out for a board. Returns an unsubscribe fn that tears the subscription down.
  subscribe(boardId: string, onEvent: (event: BoardEvent) => void): Promise<Unsubscribe>;

  // Backlog for Last-Event-ID reconnection: events with id > afterId, oldest-first. Empty/absent → [].
  replay(boardId: string, afterId: string): Promise<BoardEvent[]>;

  // Current per-board seq for reset detection. Null means no events have been published for the board.
  getCurrentSeq(boardId: string): Promise<string | null>;
}

// The full bus binds both roles; the container exports a single instance as `eventBus`.
export interface EventBus extends EventPublisher, EventSubscriber {}
