import { ok, type Result } from '@/core/shared/envelope';
import type { BoardRepository } from './repository';
import type { Board } from './board';
import type { CreateBoardInput } from './schema';

// Owner board-management use-cases. Identity (ownerId) is resolved at the route seam (resolveOwnerId),
// never from the request body — these take the already-resolved owner id.

export async function listBoards(
  boardRepo: BoardRepository,
  ownerId: string,
): Promise<Result<Board[]>> {
  return ok(await boardRepo.listByOwner(ownerId));
}

export async function createBoard(
  boardRepo: BoardRepository,
  ownerId: string,
  input: CreateBoardInput,
): Promise<Result<Board>> {
  // createForOwner mints a fresh shareToken and seeds the default statuses (atomic in the Prisma impl).
  return ok(await boardRepo.createForOwner(ownerId, input.name));
}
