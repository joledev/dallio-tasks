import { ok, err, type Result } from '@/core/shared/envelope';
import type { Actor } from '@/core/shared/actor';
import { generateSessionToken, sha256Hex } from '@/core/shared/token';
import type { BoardRepository } from '@/core/boards/repository';
import type { ActivityRepository } from '@/core/activity/repository';
import type { EventPublisher } from '@/core/realtime/event-bus';
import { activityAppended } from '@/core/realtime/events';
import { toActivityDTO } from '@/core/activity/activity';
import type { ParticipantRepository } from './repository';
import { type Participant, type GuestParticipant, toGuestParticipant } from './participant';
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
  activityRepo?: ActivityRepository,
  publisher?: EventPublisher,
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
  // NB: this count→create is a BEST-EFFORT floor, not a hard guarantee — the read and the insert are
  // not atomic, so a concurrent burst of joins can modestly overshoot MAX_PARTICIPANTS. That is
  // acceptable here: the real per-IP rate limiter is wired in L3; this is only the interim floor so
  // shipping L1b first is safe. No row lock / serializable transaction is warranted for it.
  const count = await participantRepo.countByBoard(board.id);
  if (count >= MAX_PARTICIPANTS) return err('LIMIT_EXCEEDED', 'This board is full');

  const token = generateSessionToken();
  const participant = await participantRepo.create({
    boardId: board.id,
    displayName: input.displayName,
    color: null,
    sessionTokenHash: sha256Hex(token), // store ONLY the hash — the raw token never touches the DB
  });

  if (activityRepo) {
    const activity = await activityRepo.append({
      boardId: board.id,
      participantId: participant.id,
      action: 'participant.joined',
      taskId: null,
      meta: { displayName: participant.displayName },
    });
    if (publisher) {
      void publisher
        .publish(board.id, activityAppended(board.id, participant.id, toActivityDTO(activity)))
        .catch(() => undefined);
    }
  }

  return ok({ actor: { boardId: board.id, participantId: participant.id }, participant, token });
}

// listParticipants — the read behind the participant picker + assignee filter. The caller (the route)
// has already run `resolveActor`, so authorization/board-scope is settled by the time we get here; we
// only list THIS board's participants (actor.boardId is the tenant anchor) and project each through
// `toGuestParticipant` so boardId + sessionTokenHash never leave core. UI-H6 (no pre-join enumeration)
// is enforced at the route by `resolveActor`; UI-H4 (no boardId in the body) is enforced by the DTO.
export async function listParticipants(
  participantRepo: ParticipantRepository,
  actor: Actor,
): Promise<Result<GuestParticipant[]>> {
  const rows = await participantRepo.listByBoard(actor.boardId);
  return ok(rows.map(toGuestParticipant));
}
