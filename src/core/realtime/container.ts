import type { EventBus } from './event-bus';
import type { PresenceStore } from './presence';
import type { RateLimiter } from './rate-limit';
import { RedisEventBus } from './redis-event-bus';
import { RedisPresenceStore } from './redis-presence';
import { RedisRateLimiter } from './redis-rate-limit';

// Composition root for real-time. The app imports the PORTS from here — never the redis client module.
// The ESLint boundary (src/app/**) bars `ioredis`, `@/core/realtime/redis`, and `@/core/**/redis-*`,
// so route handlers reach Redis only through these singletons. Belt (lazyConnect) + suspenders (lint).
export const eventBus: EventBus = new RedisEventBus();
export const rateLimiter: RateLimiter = new RedisRateLimiter();
export const presenceStore: PresenceStore = new RedisPresenceStore();
