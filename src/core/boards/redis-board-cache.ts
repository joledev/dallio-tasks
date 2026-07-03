import type { Redis } from 'ioredis';
import { redis } from '@/core/realtime/redis';
import type { Board } from './board';
import type { BoardCache } from './cache';

type CachedBoard = Omit<Board, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

// Versioned key: bumping this orphans every entry written by an older shape. `protected` was added to
// the Board projection in the board-management change; pre-existing `board:token:` entries would hydrate
// it as `undefined` (falsy) and silently bypass the protected-delete guard — so this rev is `v2`.
const keyFor = (token: string) => `board:token:v2:${token}`;

function serialize(board: Board): CachedBoard {
  return {
    ...board,
    createdAt: board.createdAt.toISOString(),
    updatedAt: board.updatedAt.toISOString(),
  };
}

function hydrate(row: CachedBoard): Board {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

export class RedisBoardCache implements BoardCache {
  constructor(private readonly client: Redis = redis) {}

  async getByToken(token: string): Promise<Board | null> {
    const cached = await this.client.get(keyFor(token));
    if (!cached) return null;
    try {
      const parsed = JSON.parse(cached) as CachedBoard;
      // Defense-in-depth against a shape written before a security-relevant field existed: a missing
      // `protected` would hydrate as undefined and bypass the delete guard. Treat it as a cache miss.
      if (typeof parsed.protected !== 'boolean') {
        await this.client.del(keyFor(token));
        return null;
      }
      return hydrate(parsed);
    } catch {
      await this.client.del(keyFor(token));
      return null;
    }
  }

  async setByToken(board: Board, ttlSec: number): Promise<void> {
    await this.client.set(keyFor(board.shareToken), JSON.stringify(serialize(board)), 'EX', ttlSec);
  }
}
