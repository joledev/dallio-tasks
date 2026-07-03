import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { boardApi } from './api';

// Capture the fetch call the typed client makes. Every response is a valid `{ ok: true, data }` envelope.
function mockFetch(data: unknown) {
  return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => ({ json: async () => ({ ok: true, data }) }) as unknown as Response,
  );
}

const lastCall = (f: ReturnType<typeof mockFetch>): [string, RequestInit?] =>
  f.mock.calls[f.mock.calls.length - 1];

describe('boardApi(token) — token-scoped guest client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('assign targets THIS board and posts assigneeParticipantId as JSON (CSRF content-type)', async () => {
    const fetchMock = mockFetch({ id: 't1' });
    vi.stubGlobal('fetch', fetchMock);

    await boardApi('tok-A').assignTask('t1', { assigneeParticipantId: 'p1' });

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe('/api/b/tok-A/tasks/t1/assign');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ assigneeParticipantId: 'p1' }));
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('unassign posts assigneeParticipantId: null', async () => {
    const fetchMock = mockFetch({ id: 't1' });
    vi.stubGlobal('fetch', fetchMock);

    await boardApi('tok-A').assignTask('t1', { assigneeParticipantId: null });

    const [, init] = lastCall(fetchMock);
    expect(init?.body).toBe(JSON.stringify({ assigneeParticipantId: null }));
  });

  it('listParticipants hits the token-scoped participants endpoint (GET, no body)', async () => {
    const fetchMock = mockFetch([]);
    vi.stubGlobal('fetch', fetchMock);

    await boardApi('tok-A').listParticipants();

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe('/api/b/tok-A/participants');
    expect(init?.body).toBeUndefined();
  });

  it('join posts to the token-scoped join endpoint as JSON', async () => {
    const fetchMock = mockFetch({ boardId: 'b1' });
    vi.stubGlobal('fetch', fetchMock);

    await boardApi('tok-A').join({ displayName: 'Grace' });

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe('/api/b/tok-A/join');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ displayName: 'Grace' }));
  });

  it('a client for board A can never address board B (token baked into the base path)', async () => {
    const fetchMock = mockFetch({ id: 't1' });
    vi.stubGlobal('fetch', fetchMock);

    await boardApi('A').assignTask('t1', { assigneeParticipantId: 'p1' });
    await boardApi('B').assignTask('t1', { assigneeParticipantId: 'p1' });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/b/A/tasks/t1/assign');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/b/B/tasks/t1/assign');
  });
});
