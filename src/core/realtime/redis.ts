import Redis from 'ioredis';
import { logger } from '@/core/shared/logger';

// HMR-safe singleton, mirroring src/core/shared/prisma.ts: reuse the client across dev reloads instead
// of leaking connections. This is the ONLY module allowed to construct ioredis; the Redis-touching
// adapters (redis-*.ts) import `redis` from here, and the ESLint boundary bars src/app/** from both.
//
// `lazyConnect: true` is load-bearing: importing this module never opens a socket, so `pnpm test`,
// `tsc`, `next build`, and app boot never need a live Redis. The connection is established on the first
// command; a Redis outage degrades real-time but never crashes boot. The 'error' listener keeps an
// outage from surfacing as an unhandled EventEmitter 'error' (which would crash the process).
declare global {
  var __redis: Redis | undefined;
}

function createRedis(): Redis {
  const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
  });
  client.on('error', (error: Error) => {
    logger.error({ err: { name: error.name, message: error.message } }, 'redis client error');
  });
  return client;
}

export const redis = global.__redis ?? createRedis();

if (process.env.NODE_ENV !== 'production') global.__redis = redis;
