import type { Redis } from 'ioredis';
import { redis } from './redis';
import { PRESENCE_STALE_MS, type PresenceSnapshot, type PresenceStore } from './presence';

const CONN_TTL_SEC = 60;

const onlineKey = (boardId: string) => `board:${boardId}:online`;
const connKey = (boardId: string, participantId: string) =>
  `board:${boardId}:presence:${participantId}:conns`;

export class RedisPresenceStore implements PresenceStore {
  constructor(
    private readonly client: Redis = redis,
    private readonly now: () => number = () => Date.now(),
  ) {}

  // join/leave run as atomic Lua so no other connection's INCR can interleave between a leave's DECR
  // and its ZREM (a fast tab-reload race that would otherwise remove a still-active participant and emit
  // a false participant.left). KEYS = [connKey, onlineKey]; ARGV = [ttl, now, participantId].
  async join(boardId: string, participantId: string): Promise<boolean> {
    const first = await this.client.eval(
      `local c = redis.call('INCR', KEYS[1])
       redis.call('EXPIRE', KEYS[1], ARGV[1])
       redis.call('ZADD', KEYS[2], ARGV[2], ARGV[3])
       if c == 1 then return 1 else return 0 end`,
      2,
      connKey(boardId, participantId),
      onlineKey(boardId),
      CONN_TTL_SEC,
      this.now(),
      participantId,
    );
    return first === 1;
  }

  async touch(boardId: string, participantId: string): Promise<void> {
    await this.client
      .multi()
      .expire(connKey(boardId, participantId), CONN_TTL_SEC)
      .zadd(onlineKey(boardId), String(this.now()), participantId)
      .exec();
  }

  async leave(boardId: string, participantId: string): Promise<boolean> {
    const last = await this.client.eval(
      `local c = redis.call('DECR', KEYS[1])
       if c <= 0 then
         redis.call('DEL', KEYS[1])
         redis.call('ZREM', KEYS[2], ARGV[3])
         return 1
       else
         redis.call('EXPIRE', KEYS[1], ARGV[1])
         return 0
       end`,
      2,
      connKey(boardId, participantId),
      onlineKey(boardId),
      CONN_TTL_SEC,
      this.now(),
      participantId,
    );
    return last === 1;
  }

  async online(boardId: string): Promise<PresenceSnapshot> {
    const staleBefore = this.now() - PRESENCE_STALE_MS;
    const key = onlineKey(boardId);
    const participantIds = await this.client.zrangebyscore(key, `(${staleBefore}`, '+inf');
    await this.client.zremrangebyscore(key, '-inf', String(staleBefore));
    return { participantIds, onlineCount: participantIds.length };
  }
}
