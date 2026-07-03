import { err, ok, type Result } from '@/core/shared/envelope';
import type { Actor } from '@/core/shared/actor';
import type { BoardRepository } from '@/core/boards/repository';
import type { ParticipantRepository } from '@/core/participants/repository';
import type { StatusRepository } from '@/core/statuses/repository';
import type { TaskRepository } from '@/core/tasks/repository';
import { assignTask, createTask, deleteTask, moveTask, updateTask } from '@/core/tasks/use-cases';
import type { ActivityRepository } from '@/core/activity/repository';
import type { EventPublisher } from '@/core/realtime/event-bus';
import type { PresenceStore } from '@/core/realtime/presence';
import { logger } from '@/core/shared/logger';
import { proposalApplied, proposalCreated, proposalUpdated } from '@/core/realtime/events';
import { toProposalDTO, type Proposal, type ProposalDTO } from './proposal';
import type { ProposalRepository } from './repository';
import type { CreateProposalInput, VoteInput } from './schema';
import {
  assignTaskSchema,
  createTaskSchema,
  moveTaskSchema,
  updateTaskSchema,
} from '@/core/tasks/schema';

const DEFAULT_MIN_APPROVALS = 2;
const DEFAULT_APPROVAL_RATIO = 0.5;

export type ProposalDeps = {
  proposalRepo: ProposalRepository;
  boardRepo: BoardRepository;
  taskRepo: TaskRepository;
  statusRepo: StatusRepository;
  participantRepo: ParticipantRepository;
  presence: PresenceStore;
  publisher?: EventPublisher;
  activityRepo?: ActivityRepository;
};

function intEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function ratioEnv(name: string, fallback: number): number {
  const parsed = Number.parseFloat(process.env[name] ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function approvalThreshold(onlineCount: number): number {
  const min = intEnv('PROPOSAL_MIN_APPROVALS', DEFAULT_MIN_APPROVALS);
  const ratio = ratioEnv('PROPOSAL_APPROVAL_RATIO', DEFAULT_APPROVAL_RATIO);
  return Math.max(min, Math.ceil(onlineCount * ratio));
}

function publishProposalEvent(
  publisher: EventPublisher | undefined,
  boardId: string,
  event: ReturnType<typeof proposalCreated | typeof proposalUpdated | typeof proposalApplied>,
) {
  if (!publisher) return;
  void publisher.publish(boardId, event).catch((e) => {
    const scrubbed = e as { name?: string; code?: string };
    logger.error(
      { err: { name: scrubbed?.name, code: scrubbed?.code }, boardId },
      'proposal event publish failed',
    );
  });
}

function counts(proposal: Proposal) {
  return {
    approvals: proposal.votes.filter((vote) => vote.value === 'APPROVE').length,
    rejections: proposal.votes.filter((vote) => vote.value === 'REJECT').length,
  };
}

async function rejectProposal(
  deps: ProposalDeps,
  actor: Actor,
  proposal: Proposal,
  meta: unknown,
): Promise<Result<ProposalDTO>> {
  const rejected = await deps.proposalRepo.updateStatus(
    proposal.id,
    actor.boardId,
    'REJECTED',
    meta,
  );
  if (!rejected) return err('NOT_FOUND', 'Proposal not found');
  const dto = toProposalDTO(rejected);
  publishProposalEvent(
    deps.publisher,
    actor.boardId,
    proposalUpdated(actor.boardId, actor.participantId, dto),
  );
  return ok(dto);
}

async function applyProposal(
  deps: ProposalDeps,
  actor: Actor,
  proposal: Proposal,
): Promise<Result<ProposalDTO>> {
  if (proposal.targetTaskId && proposal.targetVersion) {
    const current = await deps.taskRepo.get(proposal.targetTaskId, actor.boardId);
    if (!current || current.updatedAt.getTime() !== proposal.targetVersion.getTime()) {
      return rejectProposal(deps, actor, proposal, { reason: 'conflict' });
    }
  }

  const systemActor: Actor = { boardId: actor.boardId, participantId: null };
  let applied: Result<unknown>;

  if (proposal.kind === 'CREATE_TASK') {
    applied = await createTask(
      deps.taskRepo,
      deps.statusRepo,
      systemActor,
      createTaskSchema.parse(proposal.payload),
      deps.publisher,
      deps.activityRepo,
    );
  } else if (proposal.kind === 'UPDATE_TASK' && proposal.targetTaskId) {
    applied = await updateTask(
      deps.taskRepo,
      deps.statusRepo,
      systemActor,
      proposal.targetTaskId,
      updateTaskSchema.parse(proposal.payload),
      deps.publisher,
      deps.activityRepo,
    );
  } else if (proposal.kind === 'MOVE_TASK' && proposal.targetTaskId) {
    applied = await moveTask(
      deps.taskRepo,
      deps.statusRepo,
      systemActor,
      proposal.targetTaskId,
      moveTaskSchema.parse(proposal.payload),
      deps.publisher,
      deps.activityRepo,
    );
  } else if (proposal.kind === 'DELETE_TASK' && proposal.targetTaskId) {
    applied = await deleteTask(
      deps.taskRepo,
      systemActor,
      proposal.targetTaskId,
      deps.publisher,
      deps.activityRepo,
    );
  } else if (proposal.kind === 'ASSIGN_TASK' && proposal.targetTaskId) {
    applied = await assignTask(
      deps.taskRepo,
      deps.participantRepo,
      systemActor,
      proposal.targetTaskId,
      assignTaskSchema.parse(proposal.payload),
      deps.publisher,
      deps.activityRepo,
    );
  } else {
    return rejectProposal(deps, actor, proposal, { reason: 'invalid_payload' });
  }

  if (!applied.ok) {
    return rejectProposal(deps, actor, proposal, {
      reason: 'apply_failed',
      code: applied.error.code,
    });
  }

  const updated = await deps.proposalRepo.updateStatus(proposal.id, actor.boardId, 'APPLIED');
  if (!updated) return err('NOT_FOUND', 'Proposal not found');
  const dto = toProposalDTO(updated);
  publishProposalEvent(
    deps.publisher,
    actor.boardId,
    proposalApplied(actor.boardId, actor.participantId, dto),
  );
  return ok(dto);
}

export async function createProposal(
  deps: ProposalDeps,
  actor: Actor,
  input: CreateProposalInput,
): Promise<Result<ProposalDTO>> {
  const board = await deps.boardRepo.getById(actor.boardId);
  if (!board) return err('NOT_FOUND', 'Board not found');
  if (board.mode !== 'VOTE') return err('CONFLICT', 'Board is in direct mode');

  let targetVersion: Date | null = null;
  const targetTaskId = 'targetTaskId' in input ? input.targetTaskId : null;
  if (targetTaskId) {
    const task = await deps.taskRepo.get(targetTaskId, actor.boardId);
    if (!task) return err('NOT_FOUND', 'Task not found');
    targetVersion = task.updatedAt;
  }

  const proposal = await deps.proposalRepo.create({
    boardId: actor.boardId,
    kind: input.kind,
    targetTaskId,
    payload: input.payload,
    targetVersion,
    createdByParticipantId: actor.participantId,
  });
  const dto = toProposalDTO(proposal);
  publishProposalEvent(
    deps.publisher,
    actor.boardId,
    proposalCreated(actor.boardId, actor.participantId, dto),
  );
  return ok(dto);
}

export async function listProposals(
  deps: ProposalDeps,
  actor: Actor,
): Promise<Result<ProposalDTO[]>> {
  return ok((await deps.proposalRepo.listByBoard(actor.boardId)).map(toProposalDTO));
}

export async function voteOnProposal(
  deps: ProposalDeps,
  actor: Actor,
  id: string,
  input: VoteInput,
): Promise<Result<ProposalDTO>> {
  if (!actor.participantId) return err('UNAUTHORIZED', 'Participant required');
  const existing = await deps.proposalRepo.get(id, actor.boardId);
  if (!existing) return err('NOT_FOUND', 'Proposal not found');
  if (existing.status !== 'PENDING') return err('CONFLICT', 'Proposal is closed');

  const voted = await deps.proposalRepo.upsertVote(id, actor.participantId, input.value);
  if (!voted) return err('NOT_FOUND', 'Proposal not found');
  const dto = toProposalDTO(voted);
  publishProposalEvent(
    deps.publisher,
    actor.boardId,
    proposalUpdated(actor.boardId, actor.participantId, dto),
  );

  const online = await deps.presence.online(actor.boardId);
  const threshold = approvalThreshold(online.onlineCount);
  const tally = counts(voted);
  if (tally.approvals >= threshold) return applyProposal(deps, actor, voted);
  if (tally.rejections >= threshold) {
    return rejectProposal(deps, actor, voted, { reason: 'rejected_by_vote' });
  }
  return ok(dto);
}

export async function setBoardMode(
  deps: Pick<ProposalDeps, 'boardRepo' | 'participantRepo'>,
  actor: Actor,
  mode: 'DIRECT' | 'VOTE',
): Promise<Result<{ mode: 'DIRECT' | 'VOTE' }>> {
  if (!actor.participantId) return err('UNAUTHORIZED', 'Participant required');
  const participants = await deps.participantRepo.listByBoard(actor.boardId);
  if (participants[0]?.id !== actor.participantId) {
    return err('FORBIDDEN', 'Only the first participant can change voting mode');
  }
  const board = await deps.boardRepo.updateMode(actor.boardId, mode);
  if (!board) return err('NOT_FOUND', 'Board not found');
  return ok({ mode: board.mode });
}
