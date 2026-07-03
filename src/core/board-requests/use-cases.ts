import { ok, err, type Result } from '@/core/shared/envelope';
import type { Actor } from '@/core/shared/actor';
import type { BoardRepository } from '@/core/boards/repository';
import type { BoardRequestRepository } from './repository';
import { toPublicBoardRequest, type PublicBoardRequest } from './board-request';
import type { CreateBoardRequestInput, ResolveBoardRequestInput } from './schema';

// Guest write: file a rename/delete request against the board in scope (actor.boardId — already
// resolved + IDOR-checked by resolveActor at the route seam). A participant can't stack duplicate
// pending requests of the same kind — a cheap guard against spamming the owner's queue.
export async function createRequest(
  boardRequestRepo: BoardRequestRepository,
  actor: Actor,
  input: CreateBoardRequestInput,
): Promise<Result<PublicBoardRequest>> {
  const pending = await boardRequestRepo.listPendingByBoard(actor.boardId);
  const duplicate = pending.some(
    (r) => r.participantId === actor.participantId && r.kind === input.kind,
  );
  if (duplicate) return err('CONFLICT', 'A pending request of this kind already exists');

  const created = await boardRequestRepo.create({
    boardId: actor.boardId,
    participantId: actor.participantId,
    kind: input.kind,
    proposedName: input.kind === 'RENAME' ? (input.proposedName ?? null) : null,
  });
  return ok(toPublicBoardRequest(created));
}

// Owner read: the pending queue for a board addressed by shareToken. IDOR: wrong owner → NOT_FOUND
// (no existence disclosure), matching every other owner-scoped lookup in this codebase.
export async function listPendingRequests(
  boardRepo: BoardRepository,
  boardRequestRepo: BoardRequestRepository,
  ownerId: string,
  shareToken: string,
): Promise<Result<PublicBoardRequest[]>> {
  const board = await boardRepo.getByToken(shareToken);
  if (!board || board.ownerId !== ownerId) return err('NOT_FOUND', 'Board not found');
  const rows = await boardRequestRepo.listPendingByBoard(board.id);
  return ok(rows.map(toPublicBoardRequest));
}

export type ResolveRequestDeps = {
  boardRepo: BoardRepository;
  boardRequestRepo: BoardRequestRepository;
};

// Owner decision on a pending request. Reject just closes it out. Approve APPLIES the change first —
// RENAME (allowed even on the protected board) or DELETE (FORBIDDEN + left PENDING if the board is
// protected, so the request never reads APPROVED without the effect actually happening) — and only
// marks APPROVED once the effect has landed.
export async function resolveRequest(
  deps: ResolveRequestDeps,
  ownerId: string,
  shareToken: string,
  requestId: string,
  action: ResolveBoardRequestInput['action'],
): Promise<Result<PublicBoardRequest>> {
  const board = await deps.boardRepo.getByToken(shareToken);
  if (!board || board.ownerId !== ownerId) return err('NOT_FOUND', 'Board not found');

  const request = await deps.boardRequestRepo.getById(requestId);
  if (!request || request.boardId !== board.id) return err('NOT_FOUND', 'Request not found');
  if (request.status !== 'PENDING') return err('CONFLICT', 'Request already resolved');

  if (action === 'reject') {
    const updated = await deps.boardRequestRepo.setStatus(requestId, 'REJECTED');
    if (!updated) return err('NOT_FOUND', 'Request not found');
    return ok(toPublicBoardRequest(updated));
  }

  if (request.kind === 'RENAME') {
    if (!request.proposedName) return err('VALIDATION_ERROR', 'Request has no proposed name');
    const renamed = await deps.boardRepo.rename(board.id, request.proposedName);
    if (!renamed) return err('NOT_FOUND', 'Board not found');
  } else {
    if (board.protected) return err('FORBIDDEN', 'The demo board cannot be deleted');
    await deps.boardRepo.deleteById(board.id);
  }

  const updated = await deps.boardRequestRepo.setStatus(requestId, 'APPROVED');
  if (!updated) return err('NOT_FOUND', 'Request not found');
  return ok(toPublicBoardRequest(updated));
}
