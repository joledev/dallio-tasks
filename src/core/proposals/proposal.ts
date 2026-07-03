export type ProposalKind =
  'CREATE_TASK' | 'UPDATE_TASK' | 'MOVE_TASK' | 'DELETE_TASK' | 'ASSIGN_TASK';

export type ProposalStatus = 'PENDING' | 'APPLIED' | 'REJECTED';
export type VoteValue = 'APPROVE' | 'REJECT';

export type Vote = {
  id: string;
  proposalId: string;
  participantId: string;
  value: VoteValue;
  createdAt: Date;
  updatedAt: Date;
};

export type Proposal = {
  id: string;
  boardId: string;
  kind: ProposalKind;
  targetTaskId: string | null;
  payload: unknown;
  targetVersion: Date | null;
  status: ProposalStatus;
  meta: unknown | null;
  createdByParticipantId: string | null;
  createdAt: Date;
  updatedAt: Date;
  votes: Vote[];
};

export type ProposalDTO = Omit<Proposal, 'createdAt' | 'updatedAt' | 'targetVersion' | 'votes'> & {
  targetVersion: string | null;
  createdAt: string;
  updatedAt: string;
  votes: Array<Omit<Vote, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt: string }>;
};

export function toProposalDTO(proposal: Proposal): ProposalDTO {
  return {
    ...proposal,
    targetVersion: proposal.targetVersion?.toISOString() ?? null,
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
    votes: proposal.votes.map((vote) => ({
      ...vote,
      createdAt: vote.createdAt.toISOString(),
      updatedAt: vote.updatedAt.toISOString(),
    })),
  };
}
