// PORT interface. A deliberately thin fixed-window limiter — NOT a framework. Callers pass an opaque
// key (e.g. `join:{ip}` or `write:{pid}`), a per-window limit, and the window length in seconds.

export type RateLimitResult = {
  allowed: boolean; // false once the window's request count exceeds `limit`
  remaining: number; // requests left in the current window (never negative)
};

export interface RateLimiter {
  check(key: string, limit: number, windowSec: number): Promise<RateLimitResult>;
}
