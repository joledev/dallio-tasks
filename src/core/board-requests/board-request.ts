// Board management guest request flow. A guest cannot rename/delete a board directly — they file a
// BoardRequest; the owner approves/rejects it from the dashboard (see core/boards/use-cases.ts for the
// owner-direct path). participantId is nullable (SetNull on the requester leaving) — the domain type
// mirrors that so a stale/pruned requester never breaks the read path.
export type BoardRequest = {
  id: string;
  boardId: string;
  participantId: string | null;
  kind: 'RENAME' | 'DELETE';
  proposedName: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requesterName: string | null; // joined from Participant.displayName; null if the requester is gone
  createdAt: Date;
  updatedAt: Date;
};

// Public owner-dashboard projection: no boardId/participantId on the wire (the owner already knows
// which board they're looking at via the shareToken in the URL; the raw participant id is internal).
export type PublicBoardRequest = Pick<
  BoardRequest,
  'id' | 'kind' | 'proposedName' | 'status' | 'createdAt' | 'requesterName'
>;

export const toPublicBoardRequest = (r: BoardRequest): PublicBoardRequest => ({
  id: r.id,
  kind: r.kind,
  proposedName: r.proposedName,
  status: r.status,
  createdAt: r.createdAt,
  requesterName: r.requesterName,
});
