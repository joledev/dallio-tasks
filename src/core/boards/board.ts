// Fase 2 tenant aggregate. A user owns many boards; the board is the IDOR anchor for tasks/statuses
// (the code cutover from ownerId lands in L1b). shareToken is the unguessable guest entry point.
export type Board = {
  id: string;
  ownerId: string;
  name: string;
  shareToken: string;
  mode: 'DIRECT' | 'VOTE';
  protected: boolean;
  taskCount?: number;
  createdAt: Date;
  updatedAt: Date;
};

// Public owner-dashboard projection: the client navigates + keys by shareToken (the capability URL),
// never the internal boardId — and ownerId is authz-only. Drop both from the wire shape. `protected`
// tells the dashboard to hide Delete for the seed/demo board; `pendingRequestCount` (filled by
// listBoards) surfaces guest rename/delete requests awaiting owner approval.
export type OwnerBoardView = Pick<
  Board,
  'name' | 'shareToken' | 'taskCount' | 'protected' | 'createdAt' | 'updatedAt'
> & { pendingRequestCount?: number };

export const toOwnerBoard = (b: Board): OwnerBoardView => ({
  name: b.name,
  shareToken: b.shareToken,
  taskCount: b.taskCount,
  protected: b.protected,
  pendingRequestCount: undefined,
  createdAt: b.createdAt,
  updatedAt: b.updatedAt,
});
