import { ok, err, type Result } from '@/core/shared/envelope';
import type { Actor } from '@/core/shared/actor';
import { generateSessionToken, sha256Hex } from '@/core/shared/token';
import type { BoardRepository } from '@/core/boards/repository';
import type { ParticipantRepository } from './repository';
import type { Participant } from './participant';
import type { JoinBoardInput } from './schema';

// H2: a launch-time floor on the public join (a real per-IP limiter lands in L3). Bounds row growth
// per board so a leaked shareToken can't be used to exhaust rows before the limiter exists.
export const MAX_PARTICIPANTS = 200;

export type JoinBoardResult = {
  actor: Actor;
  participant: Participant;
  // The raw opaque token the route sets as the httpOnly cookie. null on an idempotent rejoin (H2):
  // the caller already holds a valid cookie, so no new token is minted and the cookie is left as-is.
  token: string | null;
};

// joinBoard — the public board-entry write. Resolves the board from its shareToken (unknown → 404),
// then either reuses a valid existing session (H2 idempotent rejoin) or mints a fresh Participant +
// opaque token, storing ONLY sha256(token). Enforces the per-board cap (H2) before any new row.
export async function joinBoard(
  participantRepo: ParticipantRepository,
  boardRepo: BoardRepository,
  shareToken: string,
  input: JoinBoardInput,
  existingCookieToken: string | null,
): Promise<Result<JoinBoardResult>> {
  const board = await boardRepo.getByToken(shareToken);
  if (!board) return err('NOT_FOUND', 'Board not found');

  // H2 — idempotent rejoin: a valid cookie whose participant is on THIS board returns that participant
  // and mints nothing new (no extra row, no new token). Cross-board cookies fall through to a fresh join.
  if (existingCookieToken) {
    const existing = await participantRepo.getBySessionHash(sha256Hex(existingCookieToken));
    if (existing && existing.boardId === board.id) {
      return ok({
        actor: { boardId: board.id, participantId: existing.id },
        participant: existing,
        token: null,
      });
    }
  }

  // H2 — per-board cap: reject once the board is full (row-exhaustion / launch-time DoS guard).
  const count = await participantRepo.countByBoard(board.id);
  if (count >= MAX_PARTICIPANTS) return err('LIMIT_EXCEEDED', 'This board is full');

  const token = generateSessionToken();
  const participant = await participantRepo.create({
    boardId: board.id,
    displayName: input.displayName,
    color: null,
    sessionTokenHash: sha256Hex(token), // store ONLY the hash — the raw token never touches the DB
  });

  return ok({ actor: { boardId: board.id, participantId: participant.id }, participant, token });
}
