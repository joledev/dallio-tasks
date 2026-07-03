import type { BoardEvent } from '@/core/realtime/events';
import { participantJoined, participantLeft } from '@/core/realtime/events';
import type { EventBus, ReplayResult, Unsubscribe } from '@/core/realtime/event-bus';
import type { PublicParticipant } from '@/core/participants/participant';
import type { PresenceStore } from '@/core/realtime/presence';

const encoder = new TextEncoder();
const PING_INTERVAL_MS = 15_000;

export type StreamPresenceLifecycle = {
  presence: PresenceStore;
  participant: PublicParticipant;
};

export function frameBoardEvent(event: BoardEvent): string {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function frameRefreshEvent(): string {
  return 'event: refresh\ndata: {}\n\n';
}

// A one-shot marker at the replay→live boundary: everything BEFORE it is replayed backlog (the client
// patches its cache silently), everything AFTER is live. The client gates "who did what" toasts on it
// so opening a board doesn't pop a toast for every historical event.
export function frameLiveEvent(): string {
  return 'event: live\ndata: {}\n\n';
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
  lifecycle?: StreamPresenceLifecycle,
): ReadableStream<Uint8Array> {
  let unsubscribe: Unsubscribe | null = null;
  let closed = false;
  let ping: ReturnType<typeof setInterval> | null = null;
  let joined = false;

  const cleanup = async () => {
    if (closed) return;
    closed = true;
    if (ping) clearInterval(ping);
    if (unsubscribe) await unsubscribe();
    if (joined && lifecycle) {
      const last = await lifecycle.presence.leave(boardId, lifecycle.participant.id);
      if (last) {
        const online = await lifecycle.presence.online(boardId);
        await bus.publish(
          boardId,
          participantLeft(boardId, lifecycle.participant.id, {
            participant: lifecycle.participant,
            onlineCount: online.onlineCount,
          }),
        );
      }
    }
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
      enqueue(frameLiveEvent()); // replay done → everything after this is live (client un-gates toasts)

      if (lifecycle) {
        const first = await lifecycle.presence.join(boardId, lifecycle.participant.id);
        joined = true;
        if (first) {
          const online = await lifecycle.presence.online(boardId);
          await bus.publish(
            boardId,
            participantJoined(boardId, lifecycle.participant.id, {
              participant: lifecycle.participant,
              onlineCount: online.onlineCount,
            }),
          );
        }
      }

      live = true;
      for (const event of buffered.sort((a, b) => eventId(a) - eventId(b))) enqueueEvent(event);

      ping = setInterval(() => {
        if (lifecycle) void lifecycle.presence.touch(boardId, lifecycle.participant.id);
        enqueue(': ping\n\n');
      }, pingIntervalMs);
    },
    async cancel() {
      await cleanup();
    },
  });
}
