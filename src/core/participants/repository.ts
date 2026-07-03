import type { Participant } from './participant';

export type CreateParticipantData = {
  boardId: string;
  displayName: string;
  color: string | null;
  sessionTokenHash: string;
};

// ISP: guest identity only. getById is board-scoped (the assign same-board IDOR check); getBySessionHash
// is the resolveActor lookup (global by the high-entropy hash, then boardId is verified at the seam).
export interface ParticipantRepository {
  getById(id: string, boardId: string): Promise<Participant | null>; // board-scoped
  getBySessionHash(hash: string): Promise<Participant | null>; // resolveActor lookup
  create(data: CreateParticipantData): Promise<Participant>; // join
  countByBoard(boardId: string): Promise<number>; // H2 per-board cap
}
