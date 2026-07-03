import type { Task } from '@/core/tasks/task';
import type { PublicParticipant } from '@/core/participants/participant';
import type { ActivityDTO } from '@/core/activity/activity';

// FROZEN CONTRACT (freeze-first, gates L2): the BoardEvent discriminated union + factories.
// Later layers (L2b live editing, L3 presence/activity) emit these; the SSE layer serializes them
// with `id` as the `id:` line and Last-Event-ID cursor. Do not reshape without a coordinated bump.

export type BoardEventType =
  | 'task.created'
  | 'task.updated'
  | 'task.moved'
  | 'task.deleted'
  | 'participant.joined'
  | 'participant.left'
  | 'activity.appended'
  | 'proposal.created'
  | 'proposal.updated'
  | 'proposal.applied';

// participant.joined/left carry the public participant + the current online count (spec §3.2).
export type ParticipantPresence = {
  participant: PublicParticipant;
  onlineCount: number;
};

export type ProposalEventData = {
  id: string;
  boardId: string;
  kind: string;
  targetTaskId: string | null;
  payload: unknown;
  targetVersion: string | null;
  status: 'PENDING' | 'APPLIED' | 'REJECTED';
  meta: unknown | null;
  createdByParticipantId: string | null;
  createdAt: string;
  updatedAt: string;
  votes: Array<{
    id: string;
    proposalId: string;
    participantId: string;
    value: 'APPROVE' | 'REJECT';
    createdAt: string;
    updatedAt: string;
  }>;
};

// Fields the bus stamps onto every emitted event. `id` is the per-board monotonic seq (Redis INCR),
// assigned by the publisher — never by the factory — so it doubles as the SSE id / Last-Event-ID.
type BoardEventEnvelope = {
  id: string;
  boardId: string;
  actorId: string | null; // participantId that caused it (null = system, e.g. L5 auto-apply)
  ts: string; // ISO-8601 timestamp
};

// Discriminated union: the client narrows on `type` to get a precise `data` payload.
// task.* carry the full resulting task (zero-refetch cache patch); deleted carries only the id to remove.
export type BoardEvent =
  | (BoardEventEnvelope & { type: 'task.created'; data: Task })
  | (BoardEventEnvelope & { type: 'task.updated'; data: Task })
  | (BoardEventEnvelope & { type: 'task.moved'; data: Task })
  | (BoardEventEnvelope & { type: 'task.deleted'; data: { id: string } })
  | (BoardEventEnvelope & { type: 'participant.joined'; data: ParticipantPresence })
  | (BoardEventEnvelope & { type: 'participant.left'; data: ParticipantPresence })
  | (BoardEventEnvelope & { type: 'activity.appended'; data: ActivityDTO })
  | (BoardEventEnvelope & { type: 'proposal.created'; data: ProposalEventData })
  | (BoardEventEnvelope & { type: 'proposal.updated'; data: ProposalEventData })
  | (BoardEventEnvelope & { type: 'proposal.applied'; data: ProposalEventData });

// Distributive Omit so `NewBoardEvent` stays a union (one arm per `type`), not a collapsed shape.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

// What a factory produces and `EventPublisher.publish` accepts: everything except the bus-assigned `id`.
export type NewBoardEvent = DistributiveOmit<BoardEvent, 'id'>;

const now = () => new Date().toISOString();

// Factories — pure, no Redis. They assemble a NewBoardEvent; the bus assigns `id` at publish time.
export const taskCreated = (
  boardId: string,
  actorId: string | null,
  task: Task,
): NewBoardEvent => ({ type: 'task.created', boardId, actorId, ts: now(), data: task });

export const taskUpdated = (
  boardId: string,
  actorId: string | null,
  task: Task,
): NewBoardEvent => ({ type: 'task.updated', boardId, actorId, ts: now(), data: task });

export const taskMoved = (boardId: string, actorId: string | null, task: Task): NewBoardEvent => ({
  type: 'task.moved',
  boardId,
  actorId,
  ts: now(),
  data: task,
});

export const taskDeleted = (
  boardId: string,
  actorId: string | null,
  taskId: string,
): NewBoardEvent => ({ type: 'task.deleted', boardId, actorId, ts: now(), data: { id: taskId } });

export const participantJoined = (
  boardId: string,
  actorId: string | null,
  presence: ParticipantPresence,
): NewBoardEvent => ({ type: 'participant.joined', boardId, actorId, ts: now(), data: presence });

export const participantLeft = (
  boardId: string,
  actorId: string | null,
  presence: ParticipantPresence,
): NewBoardEvent => ({ type: 'participant.left', boardId, actorId, ts: now(), data: presence });

export const activityAppended = (
  boardId: string,
  actorId: string | null,
  activity: ActivityDTO,
): NewBoardEvent => ({ type: 'activity.appended', boardId, actorId, ts: now(), data: activity });

export const proposalCreated = (
  boardId: string,
  actorId: string | null,
  proposal: ProposalEventData,
): NewBoardEvent => ({ type: 'proposal.created', boardId, actorId, ts: now(), data: proposal });

export const proposalUpdated = (
  boardId: string,
  actorId: string | null,
  proposal: ProposalEventData,
): NewBoardEvent => ({ type: 'proposal.updated', boardId, actorId, ts: now(), data: proposal });

export const proposalApplied = (
  boardId: string,
  actorId: string | null,
  proposal: ProposalEventData,
): NewBoardEvent => ({ type: 'proposal.applied', boardId, actorId, ts: now(), data: proposal });
