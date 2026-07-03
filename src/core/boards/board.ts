// Fase 2 tenant aggregate. A user owns many boards; the board is the IDOR anchor for tasks/statuses
// (the code cutover from ownerId lands in L1b). shareToken is the unguessable guest entry point.
export type Board = {
  id: string;
  ownerId: string;
  name: string;
  shareToken: string;
  createdAt: Date;
  updatedAt: Date;
};
