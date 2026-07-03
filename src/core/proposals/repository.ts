import type { Proposal, ProposalKind, ProposalStatus, VoteValue } from './proposal';

export type CreateProposalData = {
  boardId: string;
  kind: ProposalKind;
  targetTaskId: string | null;
  payload: unknown;
  targetVersion: Date | null;
  createdByParticipantId: string | null;
};

export interface ProposalRepository {
  listByBoard(boardId: string): Promise<Proposal[]>;
  get(id: string, boardId: string): Promise<Proposal | null>;
  create(data: CreateProposalData): Promise<Proposal>;
  upsertVote(proposalId: string, participantId: string, value: VoteValue): Promise<Proposal | null>;
  updateStatus(
    id: string,
    boardId: string,
    status: ProposalStatus,
    meta?: unknown,
  ): Promise<Proposal | null>;
}
