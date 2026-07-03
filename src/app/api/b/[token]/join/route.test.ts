import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryActivityRepository } from '@/test/in-memory/activity-repository';
import { InMemoryBoardRepository } from '@/test/in-memory/board-repository';
import { InMemoryEventBus } from '@/test/in-memory/event-bus';
import { InMemoryParticipantRepository } from '@/test/in-memory/participant-repository';
import { InMemoryRateLimiter } from '@/test/in-memory/rate-limit';
import type { Board } from '@/core/boards/board';

const BOARD: Board = {
  id: '00000000-0000-4000-8000-00000000000a',
  ownerId: '00000000-0000-4000-8000-000000000001',
  name: 'Board A',
  shareToken: 'tok-a',
  createdAt: new Date('2020-01-01T00:00:00.000Z'),
  updatedAt: new Date('2020-01-01T00:00:00.000Z'),
};

function joinRequest(ip = '1.2.3.4') {
  return new Request('http://localhost/api/b/tok-a/join', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify({ displayName: 'Grace' }),
  });
}

describe('POST /api/b/[token]/join rate limit', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns RATE_LIMITED/429 over cap and resets after the window', async () => {
    let clock = 1_000;
    const limiter = new InMemoryRateLimiter(() => clock);
    const boardRepository = new InMemoryBoardRepository([BOARD]);
    const participantRepository = new InMemoryParticipantRepository();
    const eventBus = new InMemoryEventBus();
    const activityRepository = new InMemoryActivityRepository();

    vi.doMock('next/headers', () => ({
      cookies: async () => ({ get: () => undefined }),
    }));
    vi.doMock('@/core/boards/container', () => ({ boardRepository }));
    vi.doMock('@/core/participants/container', () => ({ participantRepository }));
    vi.doMock('@/core/realtime/container', () => ({
      eventBus,
      rateLimiter: limiter,
    }));
    vi.doMock('@/core/activity/container', () => ({ activityRepository }));

    const { POST } = await import('./route');
    const ctx = { params: Promise.resolve({ token: 'tok-a' }) };

    for (let i = 0; i < 5; i++) {
      const res = await POST(joinRequest(), ctx);
      expect(res.status).toBe(200);
    }

    const limited = await POST(joinRequest(), ctx);
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });

    clock += 60_000;
    const reset = await POST(joinRequest(), ctx);
    expect(reset.status).toBe(200);
  });
});
