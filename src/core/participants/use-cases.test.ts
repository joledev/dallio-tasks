import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryBoardRepository } from '@/test/in-memory/board-repository';
import { InMemoryParticipantRepository } from '@/test/in-memory/participant-repository';
import { sha256Hex } from '@/core/shared/token';
import type { Board } from '@/core/boards/board';
import { joinBoard, MAX_PARTICIPANTS } from './use-cases';
import { joinBoardSchema } from './schema';

const BOARD_A: Board = {
  id: '00000000-0000-4000-8000-00000000000a',
  ownerId: '00000000-0000-4000-8000-000000000001',
  name: 'Board A',
  shareToken: 'tok-a',
  mode: 'DIRECT',
  protected: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('joinBoard', () => {
  let boardRepo: InMemoryBoardRepository;
  let participantRepo: InMemoryParticipantRepository;

  beforeEach(() => {
    boardRepo = new InMemoryBoardRepository([BOARD_A]);
    participantRepo = new InMemoryParticipantRepository();
  });

  const input = joinBoardSchema.parse({ displayName: 'Grace' });

  it('unknown shareToken → NOT_FOUND (a real 404 board)', async () => {
    const res = await joinBoard(participantRepo, boardRepo, 'nope', input, null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NOT_FOUND');
  });

  it('issues a valid opaque cookie token and stores ONLY its sha256 (raw never persisted)', async () => {
    const res = await joinBoard(participantRepo, boardRepo, 'tok-a', input, null);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const token = res.data.token;
    expect(token).toBeTruthy();
    expect(token).not.toBeNull();

    // The persisted hash is sha256(token) — and the raw token is NOT what is stored.
    expect(res.data.participant.sessionTokenHash).toBe(sha256Hex(token!));
    expect(res.data.participant.sessionTokenHash).not.toBe(token);

    // Lookup by the hash finds the row; lookup by the RAW token finds nothing (raw never persisted).
    expect(await participantRepo.getBySessionHash(sha256Hex(token!))).not.toBeNull();
    expect(await participantRepo.getBySessionHash(token!)).toBeNull();

    expect(res.data.actor).toEqual({
      boardId: BOARD_A.id,
      participantId: res.data.participant.id,
    });
  });

  it('idempotent rejoin: a valid cookie for THIS board returns the same participant, mints nothing', async () => {
    const first = await joinBoard(participantRepo, boardRepo, 'tok-a', input, null);
    if (!first.ok) throw new Error('expected ok');
    const token = first.data.token!;

    const before = await participantRepo.countByBoard(BOARD_A.id);
    const again = await joinBoard(
      participantRepo,
      boardRepo,
      'tok-a',
      joinBoardSchema.parse({ displayName: 'Grace Again' }),
      token, // carries the existing valid cookie
    );
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.data.participant.id).toBe(first.data.participant.id); // same row
    expect(again.data.token).toBeNull(); // no new token minted
    expect(await participantRepo.countByBoard(BOARD_A.id)).toBe(before); // no new row
  });

  it('a cookie from a DIFFERENT board falls through to a fresh join (not treated as rejoin)', async () => {
    // A valid token whose participant is on some OTHER board.
    const foreignToken = 'foreign-raw-token';
    await participantRepo.create({
      boardId: '00000000-0000-4000-8000-0000000000ff',
      displayName: 'Other',
      color: null,
      sessionTokenHash: sha256Hex(foreignToken),
    });
    const res = await joinBoard(participantRepo, boardRepo, 'tok-a', input, foreignToken);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.token).not.toBeNull(); // a brand-new session was minted for board A
    expect(res.data.participant.boardId).toBe(BOARD_A.id);
  });

  it('per-board cap → LIMIT_EXCEEDED once the board is full (H2)', async () => {
    for (let i = 0; i < MAX_PARTICIPANTS; i++) {
      await participantRepo.create({
        boardId: BOARD_A.id,
        displayName: `p${i}`,
        color: null,
        sessionTokenHash: `hash-${i}`,
      });
    }
    const res = await joinBoard(participantRepo, boardRepo, 'tok-a', input, null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('LIMIT_EXCEEDED');
    expect(await participantRepo.countByBoard(BOARD_A.id)).toBe(MAX_PARTICIPANTS); // no over-cap row
  });
});
