import type { Redis } from 'ioredis';
import { redis } from '@/core/realtime/redis';
import type { Board } from './board';
import type { BoardCache } from './cache';

type CachedBoard = Omit<Board, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

const keyFor = (token: string) => `board:token:${token}`;

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
      return hydrate(JSON.parse(cached) as CachedBoard);
    } catch {
      await this.client.del(keyFor(token));
      return null;
    }
  }

  async setByToken(board: Board, ttlSec: number): Promise<void> {
    await this.client.set(keyFor(board.shareToken), JSON.stringify(serialize(board)), 'EX', ttlSec);
  }
}
