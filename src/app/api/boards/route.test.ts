import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryBoardRepository } from '@/test/in-memory/board-repository';
import { InMemoryRateLimiter } from '@/test/in-memory/rate-limit';
import { InMemoryStatusRepository } from '@/test/in-memory/status-repository';

const OWNER_ID = '00000000-0000-4000-8000-000000000001';

function createRequest(ip = '1.2.3.4') {
  return new Request('http://localhost/api/boards', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify({ name: 'Launch' }),
  });
}

describe('POST /api/boards', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('SEED_OWNER_ID', OWNER_ID);
  });

  it('creates an owner-scoped board with a fresh token and default statuses', async () => {
    const statusRepository = new InMemoryStatusRepository();
    const boardRepository = new InMemoryBoardRepository([], statusRepository);
    const rateLimiter = new InMemoryRateLimiter();

    vi.doMock('@/core/boards/container', () => ({ boardRepository }));
    vi.doMock('@/core/realtime/container', () => ({ rateLimiter }));

    const { POST } = await import('./route');
    const res = await POST(createRequest());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      data: { ownerId: OWNER_ID, name: 'Launch' },
    });
    expect(body.data.shareToken).toMatch(/^[0-9a-f]{32}$/);
    await expect(statusRepository.list(body.data.id)).resolves.toHaveLength(3);
  });

  it('returns RATE_LIMITED/429 over the per-IP create cap', async () => {
    const boardRepository = new InMemoryBoardRepository([], new InMemoryStatusRepository());
    const rateLimiter = new InMemoryRateLimiter();

    vi.doMock('@/core/boards/container', () => ({ boardRepository }));
    vi.doMock('@/core/realtime/container', () => ({ rateLimiter }));

    const { POST } = await import('./route');

    for (let i = 0; i < 5; i++) {
      expect((await POST(createRequest())).status).toBe(201);
    }

    const limited = await POST(createRequest());
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
  });
});
