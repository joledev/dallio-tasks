import { ok, err, type Result } from '@/core/shared/envelope';
import type { BoardRepository } from './repository';
import { toOwnerBoard, type OwnerBoardView } from './board';
import type { CreateBoardInput } from './schema';

// Owner board-management use-cases. Identity (ownerId) is resolved at the route seam (resolveOwnerId),
// never from the request body — these take the already-resolved owner id. They return the public
// OwnerBoardView projection (no internal boardId / ownerId on the wire).

export async function listBoards(
  boardRepo: BoardRepository,
  ownerId: string,
): Promise<Result<OwnerBoardView[]>> {
  const boards = await boardRepo.listByOwner(ownerId);
  return ok(boards.map(toOwnerBoard));
}

export async function createBoard(
  boardRepo: BoardRepository,
  ownerId: string,
  input: CreateBoardInput,
): Promise<Result<OwnerBoardView>> {
  // createForOwner mints a fresh shareToken and seeds the default statuses (atomic in the Prisma impl).
  return ok(toOwnerBoard(await boardRepo.createForOwner(ownerId, input.name)));
}

// Owner-direct rename, addressed by shareToken (never boardId). IDOR: a token that resolves to a board
// the caller doesn't own collapses to NOT_FOUND (no existence disclosure) — same pattern as every other
// owner-scoped mutation in this codebase. Renaming is allowed even on the protected demo board.
export async function renameBoard(
  boardRepo: BoardRepository,
  ownerId: string,
  shareToken: string,
  name: string,
): Promise<Result<OwnerBoardView>> {
  const board = await boardRepo.getByToken(shareToken);
  if (!board || board.ownerId !== ownerId) return err('NOT_FOUND', 'Board not found');
  const updated = await boardRepo.rename(board.id, name);
  if (!updated) return err('NOT_FOUND', 'Board not found');
  return ok(toOwnerBoard(updated));
}

// Owner-direct delete, addressed by shareToken. IDOR: wrong-owner → NOT_FOUND. The seed/demo board is
// protected and can NEVER be deleted this way (or via an approved guest request) — FORBIDDEN, not a
// silent no-op, so the owner UI can surface why the action is blocked.
export async function deleteBoard(
  boardRepo: BoardRepository,
  ownerId: string,
  shareToken: string,
): Promise<Result<null>> {
  const board = await boardRepo.getByToken(shareToken);
  if (!board || board.ownerId !== ownerId) return err('NOT_FOUND', 'Board not found');
  if (board.protected) return err('FORBIDDEN', 'The demo board cannot be deleted');
  await boardRepo.deleteById(board.id);
  return ok(null);
}
