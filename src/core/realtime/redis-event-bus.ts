import type { Redis } from 'ioredis';
import { redis } from './redis';
import type { EventBus, ReplayResult, Unsubscribe } from './event-bus';
import type { BoardEvent, NewBoardEvent } from './events';

// Redis-backed EventBus (pub/sub + capped list — NOT Streams, per the right-sizing decision).
//   board:{id}:seq  INCR counter → monotonic event id
//   board:{id}:log  capped LIST (LPUSH + LTRIM 0 998, newest-first) → replay backlog
//   board:{id}      pub/sub channel → live multi-pod fan-out
const LOG_CAP = 999; // keep the newest 999 events per board (LTRIM 0..998)

const seqKey = (boardId: string) => `board:${boardId}:seq`;
const logKey = (boardId: string) => `board:${boardId}:log`;
const channelKey = (boardId: string) => `board:${boardId}`;

export class RedisEventBus implements EventBus {
  constructor(private readonly client: Redis = redis) {}

  async publish(boardId: string, event: NewBoardEvent): Promise<BoardEvent> {
    await this.client.set(seqKey(boardId), String(Date.now()), 'NX');
    const id = String(await this.client.incr(seqKey(boardId)));
    const full = { ...event, id } as BoardEvent;
    const json = JSON.stringify(full);

    // LPUSH (newest at head) + LTRIM to the cap, then fan out. Pipelined for a single round-trip.
    await this.client
      .multi()
      .lpush(logKey(boardId), json)
      .ltrim(logKey(boardId), 0, LOG_CAP - 1)
      .publish(channelKey(boardId), json)
      .exec();

    return full;
  }

  async subscribe(boardId: string, onEvent: (event: BoardEvent) => void): Promise<Unsubscribe> {
    // ioredis requires a dedicated connection for SUBSCRIBE; duplicate() inherits lazyConnect and
    // connects on subscribe(). One channel per board keeps the fan-out surgical.
    const sub = this.client.duplicate();
    const channel = channelKey(boardId);
    await sub.subscribe(channel);
    sub.on('message', (_channel: string, message: string) => {
      try {
        onEvent(JSON.parse(message) as BoardEvent);
      } catch {
        // Ignore a malformed frame rather than tearing down the whole subscription.
      }
    });
    return async () => {
      await sub.unsubscribe(channel);
      sub.disconnect();
    };
  }

  async replay(boardId: string, afterId: string): Promise<ReplayResult> {
    const after = Number(afterId);
    const raw = await this.client.lrange(logKey(boardId), 0, -1); // newest-first (LPUSH order)
    const events = raw
      .map((r) => JSON.parse(r) as BoardEvent)
      .sort((a, b) => Number(a.id) - Number(b.id)); // oldest-first for replay
    return {
      events: events.filter((e) => Number(e.id) > after),
      oldestId: events[0]?.id ?? null,
    };
  }

  async getCurrentSeq(boardId: string): Promise<string | null> {
    return this.client.get(seqKey(boardId));
  }
}
