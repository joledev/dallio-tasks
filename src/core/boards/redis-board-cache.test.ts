import { describe, expect, it } from 'vitest';
import { RedisBoardCache } from './redis-board-cache';
import type { Board } from './board';

const BOARD: Board = {
  id: '00000000-0000-4000-8000-00000000000a',
  ownerId: '00000000-0000-4000-8000-000000000001',
  name: 'Board A',
  shareToken: 'tok-a',
  createdAt: new Date('2020-01-01T00:00:00.000Z'),
  updatedAt: new Date('2020-01-02T00:00:00.000Z'),
};

class FakeRedis {
  rows = new Map<string, string>();
  ttl = new Map<string, number>();

  async get(key: string) {
    return this.rows.get(key) ?? null;
  }

  async set(key: string, value: string, mode: 'EX', ttl: number) {
    this.rows.set(key, value);
    if (mode === 'EX') this.ttl.set(key, ttl);
  }

  async del(key: string) {
    this.rows.delete(key);
    this.ttl.delete(key);
  }
}

describe('RedisBoardCache', () => {
  it('stores token lookups with a TTL and hydrates dates', async () => {
    const redis = new FakeRedis();
    const cache = new RedisBoardCache(redis as never);

    await cache.setByToken(BOARD, 300);

    expect(redis.ttl.get('board:token:tok-a')).toBe(300);
    await expect(cache.getByToken('tok-a')).resolves.toMatchObject({
      id: BOARD.id,
      shareToken: BOARD.shareToken,
      createdAt: BOARD.createdAt,
      updatedAt: BOARD.updatedAt,
    });
  });

  it('drops corrupt cache rows as a miss', async () => {
    const redis = new FakeRedis();
    redis.rows.set('board:token:tok-a', '{');
    const cache = new RedisBoardCache(redis as never);

    await expect(cache.getByToken('tok-a')).resolves.toBeNull();
    expect(redis.rows.has('board:token:tok-a')).toBe(false);
  });
});
