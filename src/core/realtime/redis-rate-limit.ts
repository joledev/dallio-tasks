import type { Redis } from 'ioredis';
import { redis } from './redis';
import type { RateLimiter, RateLimitResult } from './rate-limit';

// Redis-backed fixed-window limiter: INCR the window key, set EXPIRE on first hit so the counter
// self-resets when the window elapses.  rl:{key}:{windowSec} isolates different windows for one key.
export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly client: Redis = redis) {}

  async check(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
    const bucket = `rl:${key}:${windowSec}`;
    const count = await this.client.incr(bucket);
    if (count === 1) {
      // First hit in a fresh window — arm the TTL so the counter expires and resets.
      await this.client.expire(bucket, windowSec);
    }
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  }
}
