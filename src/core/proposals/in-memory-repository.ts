import { randomUUID } from 'node:crypto';
import type { Proposal, ProposalStatus, Vote, VoteValue } from './proposal';
import type { CreateProposalData, ProposalRepository } from './repository';

export class InMemoryProposalRepository implements ProposalRepository {
  private rows: Proposal[] = [];
  private seq = 0;

  private now(): Date {
    return new Date(Date.UTC(2020, 0, 1) + this.seq++ * 1000);
  }

  private clone(proposal: Proposal): Proposal {
    return { ...proposal, votes: proposal.votes.map((vote) => ({ ...vote })) };
  }

  async listByBoard(boardId: string) {
    return this.rows
      .filter((proposal) => proposal.boardId === boardId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((proposal) => this.clone(proposal));
  }

  async get(id: string, boardId: string) {
    const proposal = this.rows.find((row) => row.id === id && row.boardId === boardId);
    return proposal ? this.clone(proposal) : null;
  }

  async create(data: CreateProposalData) {
    const now = this.now();
    const proposal: Proposal = {
      id: randomUUID(),
      boardId: data.boardId,
      kind: data.kind,
      targetTaskId: data.targetTaskId,
      payload: data.payload,
      targetVersion: data.targetVersion,
      status: 'PENDING',
      meta: null,
      createdByParticipantId: data.createdByParticipantId,
      createdAt: now,
      updatedAt: now,
      votes: [],
    };
    this.rows.push(proposal);
    return this.clone(proposal);
  }

  async upsertVote(proposalId: string, participantId: string, value: VoteValue) {
    const proposal = this.rows.find((row) => row.id === proposalId);
    if (!proposal || proposal.status !== 'PENDING') return null;
    const existing = proposal.votes.find((vote) => vote.participantId === participantId);
    const now = this.now();
    if (existing) {
      existing.value = value;
      existing.updatedAt = now;
    } else {
      const vote: Vote = {
        id: randomUUID(),
        proposalId,
        participantId,
        value,
        createdAt: now,
        updatedAt: now,
      };
      proposal.votes.push(vote);
    }
    proposal.updatedAt = now;
    return this.clone(proposal);
  }

  async updateStatus(id: string, boardId: string, status: ProposalStatus, meta?: unknown) {
    const proposal = this.rows.find((row) => row.id === id && row.boardId === boardId);
    if (!proposal) return null;
    proposal.status = status;
    if (meta !== undefined) proposal.meta = meta;
    proposal.updatedAt = this.now();
    return this.clone(proposal);
  }
}
