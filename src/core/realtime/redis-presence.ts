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

  async join(boardId: string, participantId: string): Promise<boolean> {
    const key = connKey(boardId, participantId);
    const count = await this.client.incr(key);
    await this.client
      .multi()
      .expire(key, CONN_TTL_SEC)
      .zadd(onlineKey(boardId), String(this.now()), participantId)
      .exec();
    return count === 1;
  }

  async touch(boardId: string, participantId: string): Promise<void> {
    await this.client
      .multi()
      .expire(connKey(boardId, participantId), CONN_TTL_SEC)
      .zadd(onlineKey(boardId), String(this.now()), participantId)
      .exec();
  }

  async leave(boardId: string, participantId: string): Promise<boolean> {
    const key = connKey(boardId, participantId);
    const count = await this.client.decr(key);
    if (count > 0) {
      await this.client.expire(key, CONN_TTL_SEC);
      return false;
    }
    await this.client.multi().del(key).zrem(onlineKey(boardId), participantId).exec();
    return true;
  }

  async online(boardId: string): Promise<PresenceSnapshot> {
    const staleBefore = this.now() - PRESENCE_STALE_MS;
    const key = onlineKey(boardId);
    const participantIds = await this.client.zrangebyscore(key, `(${staleBefore}`, '+inf');
    await this.client.zremrangebyscore(key, '-inf', String(staleBefore));
    return { participantIds, onlineCount: participantIds.length };
  }
}
