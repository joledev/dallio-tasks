import type { RateLimiter, RateLimitResult } from '@/core/realtime/rate-limit';

// In-memory fixed-window RateLimiter for unit tests. The clock is injectable so a test can advance
// past a window boundary and assert the counter resets — no sleeping, no Redis.
export class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async check(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
    const bucket = `${key}:${windowSec}`;
    const t = this.now();
    const existing = this.buckets.get(bucket);

    if (!existing || t >= existing.resetAt) {
      this.buckets.set(bucket, { count: 1, resetAt: t + windowSec * 1000 });
      return { allowed: 1 <= limit, remaining: Math.max(0, limit - 1) };
    }

    existing.count += 1;
    return { allowed: existing.count <= limit, remaining: Math.max(0, limit - existing.count) };
  }
}
