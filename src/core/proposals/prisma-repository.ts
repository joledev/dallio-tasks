import type { Prisma } from '@prisma/client';
import { prisma } from '@/core/shared/prisma';
import type { Proposal, ProposalKind, Vote } from './proposal';
import type { CreateProposalData, ProposalRepository } from './repository';

const INCLUDE_VOTES = { votes: true } as const;
type ProposalRow = Prisma.ProposalGetPayload<{ include: typeof INCLUDE_VOTES }>;
type VoteRow = Prisma.VoteGetPayload<object>;

const toVote = (row: VoteRow): Vote => ({
  id: row.id,
  proposalId: row.proposalId,
  participantId: row.participantId,
  value: row.value,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toProposal = (row: ProposalRow): Proposal => ({
  id: row.id,
  boardId: row.boardId,
  kind: row.kind as ProposalKind,
  targetTaskId: row.targetTaskId,
  payload: row.payload,
  targetVersion: row.targetVersion,
  status: row.status,
  meta: row.meta,
  createdByParticipantId: row.createdByParticipantId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  votes: row.votes.map(toVote),
});

export class PrismaProposalRepository implements ProposalRepository {
  async listByBoard(boardId: string) {
    const rows = await prisma.proposal.findMany({
      where: { boardId },
      include: INCLUDE_VOTES,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toProposal);
  }

  async get(id: string, boardId: string) {
    const row = await prisma.proposal.findFirst({ where: { id, boardId }, include: INCLUDE_VOTES });
    return row ? toProposal(row) : null;
  }

  async create(data: CreateProposalData) {
    const row = await prisma.proposal.create({
      data: {
        boardId: data.boardId,
        kind: data.kind,
        targetTaskId: data.targetTaskId,
        payload: data.payload as Prisma.InputJsonValue,
        targetVersion: data.targetVersion,
        createdByParticipantId: data.createdByParticipantId,
      },
      include: INCLUDE_VOTES,
    });
    return toProposal(row);
  }

  async upsertVote(proposalId: string, participantId: string, value: Vote['value']) {
    const existing = await prisma.proposal.findUnique({ where: { id: proposalId } });
    if (!existing || existing.status !== 'PENDING') return null;
    await prisma.vote.upsert({
      where: { proposalId_participantId: { proposalId, participantId } },
      create: { proposalId, participantId, value },
      update: { value },
    });
    const row = await prisma.proposal.findUnique({
      where: { id: proposalId },
      include: INCLUDE_VOTES,
    });
    return row ? toProposal(row) : null;
  }

  async updateStatus(id: string, boardId: string, status: Proposal['status'], meta?: unknown) {
    const res = await prisma.proposal.updateMany({
      where: { id, boardId },
      data: { status, ...(meta !== undefined ? { meta: meta as Prisma.InputJsonValue } : {}) },
    });
    if (res.count === 0) return null;
    const row = await prisma.proposal.findFirst({ where: { id, boardId }, include: INCLUDE_VOTES });
    return row ? toProposal(row) : null;
  }
}
