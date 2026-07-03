import { ok, type Result } from '@/core/shared/envelope';
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
