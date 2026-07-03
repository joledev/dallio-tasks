// Fase 2 tenant aggregate. A user owns many boards; the board is the IDOR anchor for tasks/statuses
// (the code cutover from ownerId lands in L1b). shareToken is the unguessable guest entry point.
export type Board = {
  id: string;
  ownerId: string;
  name: string;
  shareToken: string;
  taskCount?: number;
  createdAt: Date;
  updatedAt: Date;
};

// Public owner-dashboard projection: the client navigates + keys by shareToken (the capability URL),
// never the internal boardId — and ownerId is authz-only. Drop both from the wire shape.
export type OwnerBoardView = Pick<
  Board,
  'name' | 'shareToken' | 'taskCount' | 'createdAt' | 'updatedAt'
>;

export const toOwnerBoard = (b: Board): OwnerBoardView => ({
  name: b.name,
  shareToken: b.shareToken,
  taskCount: b.taskCount,
  createdAt: b.createdAt,
  updatedAt: b.updatedAt,
});
