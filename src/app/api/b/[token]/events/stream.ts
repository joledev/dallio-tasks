import type { BoardEvent } from '@/core/realtime/events';
import type { EventBus, ReplayResult, Unsubscribe } from '@/core/realtime/event-bus';

const encoder = new TextEncoder();
const PING_INTERVAL_MS = 15_000;

export function frameBoardEvent(event: BoardEvent): string {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function frameRefreshEvent(): string {
  return 'event: refresh\ndata: {}\n\n';
}

function parseCursor(value: string | null): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function eventId(event: BoardEvent): number {
  return Number(event.id);
}

export async function shouldRefreshForCursor(
  bus: Pick<EventBus, 'getCurrentSeq'>,
  boardId: string,
  afterId: string | null,
): Promise<boolean> {
  const after = parseCursor(afterId);
  if (after === 0) return false;
  const current = Number(await bus.getCurrentSeq(boardId));
  return Number.isFinite(current) && current < after;
}

export function shouldRefreshForReplayGap(
  afterId: string | null,
  replay: ReplayResult,
  currentSeq: string | null,
): boolean {
  const after = parseCursor(afterId);
  if (after === 0) return false;
  const current = Number(currentSeq ?? 0);
  if (!Number.isFinite(current) || current <= after) return false;
  const oldest = replay.oldestId === null ? null : Number(replay.oldestId);
  if (oldest === null) return true;
  return Number.isFinite(oldest) && oldest > after + 1;
}

export function createBoardEventStream(
  bus: EventBus,
  boardId: string,
  afterId: string | null,
  pingIntervalMs = PING_INTERVAL_MS,
): ReadableStream<Uint8Array> {
  let unsubscribe: Unsubscribe | null = null;
  let closed = false;
  let ping: ReturnType<typeof setInterval> | null = null;

  const cleanup = async () => {
    if (closed) return;
    closed = true;
    if (ping) clearInterval(ping);
    if (unsubscribe) await unsubscribe();
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let cursor = parseCursor(afterId);
      let live = false;
      const buffered: BoardEvent[] = [];

      const enqueue = (frame: string) => {
        if (!closed) controller.enqueue(encoder.encode(frame));
      };

      const enqueueEvent = (event: BoardEvent) => {
        const id = eventId(event);
        if (!Number.isFinite(id) || id <= cursor) return;
        cursor = id;
        enqueue(frameBoardEvent(event));
      };

      const resolvedUnsubscribe = await bus.subscribe(boardId, (event) => {
        if (!live) buffered.push(event);
        else enqueueEvent(event);
      });
      if (closed) {
        await resolvedUnsubscribe();
        return;
      }
      unsubscribe = resolvedUnsubscribe;

      if (await shouldRefreshForCursor(bus, boardId, afterId)) {
        if (closed) return;
        enqueue(frameRefreshEvent());
        await cleanup();
        controller.close();
        return;
      }
      if (closed) return;

      const replayed = await bus.replay(boardId, String(cursor));
      if (closed) return;
      const currentSeq = await bus.getCurrentSeq(boardId);
      if (closed) return;
      if (shouldRefreshForReplayGap(afterId, replayed, currentSeq)) {
        enqueue(frameRefreshEvent());
        await cleanup();
        controller.close();
        return;
      }
      for (const event of replayed.events) enqueueEvent(event);

      live = true;
      for (const event of buffered.sort((a, b) => eventId(a) - eventId(b))) enqueueEvent(event);

      ping = setInterval(() => enqueue(': ping\n\n'), pingIntervalMs);
    },
    async cancel() {
      await cleanup();
    },
  });
}
