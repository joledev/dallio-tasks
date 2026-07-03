import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryBoardRepository } from '@/test/in-memory/board-repository';
import { InMemoryParticipantRepository } from '@/test/in-memory/participant-repository';
import { sha256Hex } from '@/core/shared/token';
import type { Board } from '@/core/boards/board';
import { resolveActor, type CookieReader } from './session';
import { guestCookieName } from './guest';

const BOARD_A: Board = {
  id: '00000000-0000-4000-8000-00000000000a',
  ownerId: '00000000-0000-4000-8000-000000000001',
  name: 'Board A',
  shareToken: 'tok-a',
  mode: 'DIRECT',
  createdAt: new Date(),
  updatedAt: new Date(),
};
const BOARD_B: Board = {
  ...BOARD_A,
  id: '00000000-0000-4000-8000-00000000000b',
  shareToken: 'tok-b',
};

const RAW_A = 'raw-token-for-A';

// A CookieReader that only knows the guest cookie name (matching next/headers cookies().get()).
const cookieWith = (value: string | null): CookieReader => ({
  get: (name: string) => (name === guestCookieName() && value !== null ? { value } : undefined),
});

describe('resolveActor — guest session seam (design B)', () => {
  let boardRepo: InMemoryBoardRepository;
  let participantRepo: InMemoryParticipantRepository;
  let participantAId: string;

  beforeEach(async () => {
    boardRepo = new InMemoryBoardRepository([BOARD_A, BOARD_B]);
    participantRepo = new InMemoryParticipantRepository();
    const pA = await participantRepo.create({
      boardId: BOARD_A.id,
      displayName: 'Grace',
      color: null,
      sessionTokenHash: sha256Hex(RAW_A), // the cookie carries RAW_A; the DB stores its hash
    });
    participantAId = pA.id;
  });

  it('unknown shareToken → NOT_FOUND (before any cookie work)', async () => {
    const res = await resolveActor(boardRepo, participantRepo, 'nope', cookieWith(RAW_A));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND');
  });

  it('valid cookie on the correct board → ok with the participant id', async () => {
    const res = await resolveActor(boardRepo, participantRepo, 'tok-a', cookieWith(RAW_A));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ boardId: BOARD_A.id, participantId: participantAId });
  });

  it('missing cookie → UNAUTHORIZED', async () => {
    const res = await resolveActor(boardRepo, participantRepo, 'tok-a', cookieWith(null));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('UNAUTHORIZED');
  });

  it('forged / unknown cookie value → UNAUTHORIZED (no matching hash)', async () => {
    const res = await resolveActor(boardRepo, participantRepo, 'tok-a', cookieWith('garbage'));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('UNAUTHORIZED');
  });

  it('foreign-board cookie (valid for A) used against board B → UNAUTHORIZED (cross-board isolation)', async () => {
    const res = await resolveActor(boardRepo, participantRepo, 'tok-b', cookieWith(RAW_A));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('UNAUTHORIZED');
  });
});
