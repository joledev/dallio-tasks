import { ok, err, type Result } from '@/core/shared/envelope';
import type { Actor } from '@/core/shared/actor';
import type { BoardRepository } from '@/core/boards/repository';

// Fase 1: the seeded single owner. The auth bonus replaces this body with JWT/session extraction —
// nothing else in the app changes (identity is always derived here, never from the request body).
export function resolveActingUserId(): Result<string> {
  const id = process.env.SEED_OWNER_ID;
  return id ? { ok: true, data: id } : err('UNAUTHORIZED', 'No acting user');
}

// Interim board resolver (pre-guest): the seed owner acts directly on their own board.
// The guest layer will add resolveActor(shareToken) returning the same Actor shape.
export async function resolveActingBoard(boardRepo: BoardRepository): Promise<Result<Actor>> {
  const ownerId = process.env.SEED_OWNER_ID;
  if (!ownerId) return err('UNAUTHORIZED', 'No acting user');
  const board = await boardRepo.getByOwnerId(ownerId);
  if (!board) return err('UNAUTHORIZED', 'No board for acting user');
  return ok({ boardId: board.id, participantId: null });
}
