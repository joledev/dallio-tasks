import { ok, err, type Result } from '@/core/shared/envelope';
import type { Actor } from '@/core/shared/actor';
import { sha256Hex } from '@/core/shared/token';
import type { BoardRepository } from '@/core/boards/repository';
import type { ParticipantRepository } from '@/core/participants/repository';
import { guestCookieName } from './guest';

// Fase 1: the seeded single owner. The auth bonus replaces this body with JWT/session extraction —
// nothing else in the app changes (identity is always derived here, never from the request body).
// Used by owner board-management routes (GET/POST /api/boards) — the future-auth swap point.
export function resolveOwnerId(): Result<string> {
  const id = process.env.SEED_OWNER_ID;
  return id ? ok(id) : err('UNAUTHORIZED', 'No acting user');
}

// Interim board resolver (pre-guest): the seed owner acts directly on their own board. Kept so the
// flat /api/tasks|statuses routes keep working (aliased to the owner's board) for the single-owner UI.
export async function resolveActingBoard(boardRepo: BoardRepository): Promise<Result<Actor>> {
  const ownerId = process.env.SEED_OWNER_ID;
  if (!ownerId) return err('UNAUTHORIZED', 'No acting user');
  const board = await boardRepo.getByOwnerId(ownerId);
  if (!board) return err('UNAUTHORIZED', 'No board for acting user');
  return ok({ boardId: board.id, participantId: null });
}

// A minimal reader over next/headers `cookies()` (or any equivalent store) so the seam stays testable.
export type CookieReader = { get(name: string): { value: string } | undefined };

// resolveActor — the guest session seam (design B, opaque token). Resolve the board from the URL
// shareToken (unknown → NOT_FOUND, a real 404 board), read the opaque cookie, sha256 it, look the
// participant up by that hash, and REQUIRE participant.boardId === the URL board (cross-board
// isolation). Any failure below the board-existence check collapses to UNAUTHORIZED — a cookie minted
// on board A never authorizes board B, and a missing/forged/tampered cookie is indistinguishable.
export async function resolveActor(
  boardRepo: BoardRepository,
  participantRepo: ParticipantRepository,
  shareToken: string,
  cookies: CookieReader,
): Promise<Result<Actor>> {
  const board = await boardRepo.getByToken(shareToken);
  if (!board) return err('NOT_FOUND', 'Board not found');

  const raw = cookies.get(guestCookieName())?.value;
  if (!raw) return err('UNAUTHORIZED', 'Not joined');

  const participant = await participantRepo.getBySessionHash(sha256Hex(raw));
  if (!participant || participant.boardId !== board.id) return err('UNAUTHORIZED', 'Not joined');

  return ok({ boardId: board.id, participantId: participant.id });
}
