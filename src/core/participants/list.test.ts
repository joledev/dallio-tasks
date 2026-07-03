import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryBoardRepository } from '@/test/in-memory/board-repository';
import { InMemoryParticipantRepository } from '@/test/in-memory/participant-repository';
import { sha256Hex } from '@/core/shared/token';
import { resolveActor, type CookieReader } from '@/app/api/_shared/session';
import { guestCookieName } from '@/app/api/_shared/guest';
import type { Board } from '@/core/boards/board';
import type { Actor } from '@/core/shared/actor';
import { listParticipants } from './use-cases';
import { toGuestParticipant } from './participant';

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
const BOARD_B: Board = {
  ...BOARD_A,
  id: '00000000-0000-4000-8000-00000000000b',
  shareToken: 'tok-b',
};

const RAW_A = 'raw-token-for-A';

const cookieWith = (value: string | null): CookieReader => ({
  get: (name: string) => (name === guestCookieName() && value !== null ? { value } : undefined),
});

describe('toGuestParticipant (UI-H4) — the ONLY participant shape the client sees', () => {
  it('projects to exactly { id, displayName, color } — no boardId, no sessionTokenHash', () => {
    const dto = toGuestParticipant({
      id: 'p1',
      boardId: BOARD_A.id,
      displayName: 'Grace',
      color: null,
      sessionTokenHash: sha256Hex(RAW_A),
      joinedAt: new Date(),
      lastSeenAt: new Date(),
    });
    expect(Object.keys(dto).sort()).toEqual(['color', 'displayName', 'id']);
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain('boardId');
    expect(serialized).not.toContain('sessionTokenHash');
    expect(serialized).not.toContain(BOARD_A.id);
  });
});

describe('listParticipants — the participant picker / assignee-filter source', () => {
  let boardRepo: InMemoryBoardRepository;
  let participantRepo: InMemoryParticipantRepository;

  beforeEach(async () => {
    boardRepo = new InMemoryBoardRepository([BOARD_A, BOARD_B]);
    participantRepo = new InMemoryParticipantRepository();
    // Two on board A (one holds the RAW_A cookie), one on board B — the cross-board control.
    await participantRepo.create({
      boardId: BOARD_A.id,
      displayName: 'Grace',
      color: null,
      sessionTokenHash: sha256Hex(RAW_A),
    });
    await participantRepo.create({
      boardId: BOARD_A.id,
      displayName: 'Ada',
      color: 'blue',
      sessionTokenHash: 'hash-ada',
    });
    await participantRepo.create({
      boardId: BOARD_B.id,
      displayName: 'Elsewhere',
      color: null,
      sessionTokenHash: 'hash-b',
    });
  });

  it('lists only THIS board and every item is a guest DTO (no boardId / sessionTokenHash)', async () => {
    const actor: Actor = { boardId: BOARD_A.id, participantId: null };
    const res = await listParticipants(participantRepo, actor);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.map((p) => p.displayName).sort()).toEqual(['Ada', 'Grace']); // board B excluded
    for (const p of res.data) expect(Object.keys(p).sort()).toEqual(['color', 'displayName', 'id']);

    const body = JSON.stringify(res.data);
    expect(body).not.toContain('boardId');
    expect(body).not.toContain('sessionTokenHash');
    expect(body).not.toContain('hash-ada');
  });

  it('UI-H6 — the endpoint gate: a pre-join caller never reaches the list (resolveActor → UNAUTHORIZED)', async () => {
    // The route runs resolveActor BEFORE listParticipants. Without a joined cookie there is no actor,
    // so participant names/ids are never enumerable by a bare-shareToken holder.
    const gate = await resolveActor(boardRepo, participantRepo, 'tok-a', cookieWith(null));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.error.code).toBe('UNAUTHORIZED');
  });

  it('a joined guest passes the gate and then lists the board participants', async () => {
    const gate = await resolveActor(boardRepo, participantRepo, 'tok-a', cookieWith(RAW_A));
    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    const res = await listParticipants(participantRepo, gate.data);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toHaveLength(2);
  });
});
