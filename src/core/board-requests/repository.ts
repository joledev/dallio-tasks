import type { BoardRequest } from './board-request';

export type CreateBoardRequestData = {
  boardId: string;
  participantId: string | null;
  kind: BoardRequest['kind'];
  proposedName: string | null;
};

// ISP: the guest write path (create) is separate from the owner read/resolve path (listPendingByBoard /
// getById / setStatus) — same split as ParticipantRepository's guest-vs-owner methods.
export interface BoardRequestRepository {
  create(input: CreateBoardRequestData): Promise<BoardRequest>;
  listPendingByBoard(boardId: string): Promise<BoardRequest[]>;
  getById(id: string): Promise<BoardRequest | null>;
  setStatus(id: string, status: 'APPROVED' | 'REJECTED'): Promise<BoardRequest | null>;
}
