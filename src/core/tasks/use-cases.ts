import { ok, err, type Result } from '@/core/shared/envelope';
import { pageOffset, type Paginated } from '@/core/shared/pagination';
import type { Actor } from '@/core/shared/actor';
import type { ParticipantRepository } from '@/core/participants/repository';
import type { StatusRepository } from '@/core/statuses/repository';
import { logger } from '@/core/shared/logger';
import type { EventPublisher } from '@/core/realtime/event-bus';
import {
  activityAppended,
  taskCreated,
  taskUpdated,
  taskMoved,
  taskDeleted,
} from '@/core/realtime/events';
import { toActivityDTO, type ActivityAction } from '@/core/activity/activity';
import type { ActivityRepository } from '@/core/activity/repository';
import type { TaskRepository } from './repository';
import type { Task } from './task';
import type {
  CreateTaskInput,
  UpdateTaskInput,
  MoveTaskInput,
  AssignTaskInput,
  ListTasksQuery,
} from './schema';

function publishTaskEvent(
  publisher: EventPublisher | undefined,
  boardId: string,
  event: ReturnType<
    typeof taskCreated | typeof taskUpdated | typeof taskMoved | typeof taskDeleted
  >,
) {
  if (!publisher) return;
  void publisher.publish(boardId, event).catch((e) => {
    const scrubbed = e as { name?: string; code?: string };
    logger.error(
      { err: { name: scrubbed?.name, code: scrubbed?.code }, boardId },
      'event publish failed',
    );
  });
}

function publishActivity(
  publisher: EventPublisher | undefined,
  boardId: string,
  actorId: string | null,
  activity: ReturnType<typeof toActivityDTO>,
) {
  if (!publisher) return;
  void publisher.publish(boardId, activityAppended(boardId, actorId, activity)).catch((e) => {
    const scrubbed = e as { name?: string; code?: string };
    logger.error(
      { err: { name: scrubbed?.name, code: scrubbed?.code }, boardId },
      'activity publish failed',
    );
  });
}

async function appendTaskActivity(
  activityRepo: ActivityRepository | undefined,
  publisher: EventPublisher | undefined,
  actor: Actor,
  action: ActivityAction,
  task: Pick<Task, 'id' | 'title'>,
) {
  if (!activityRepo) return;
  const activity = await activityRepo.append({
    boardId: actor.boardId,
    participantId: actor.participantId,
    action,
    taskId: task.id,
    meta: { title: task.title },
  });
  publishActivity(publisher, actor.boardId, actor.participantId, toActivityDTO(activity));
}

// Rich use-case: resolves the status server-side. A supplied statusId is scope-checked (IDOR — a
// foreign/unknown id is invisible → rejected); an absent one falls back to the board's default.
export async function createTask(
  repo: TaskRepository,
  statusRepo: StatusRepository,
  actor: Actor,
  input: CreateTaskInput,
  publisher?: EventPublisher,
  activityRepo?: ActivityRepository,
): Promise<Result<Task>> {
  const statusId = input.statusId
    ? (await statusRepo.getById(input.statusId, actor.boardId))?.id
    : (await statusRepo.getDefault(actor.boardId))?.id;
  if (!statusId) return err('VALIDATION_ERROR', 'Unknown status');

  const task = await repo.create({
    title: input.title,
    description: input.description ?? null,
    statusId,
    priority: input.priority,
    boardId: actor.boardId, // derived identity, never from the body
    createdByParticipantId: actor.participantId, // guest attribution (null for owner-direct)
    assigneeParticipantId: null, // created unassigned
  });
  await appendTaskActivity(activityRepo, publisher, actor, 'task.created', task);
  publishTaskEvent(publisher, actor.boardId, taskCreated(actor.boardId, actor.participantId, task));
  return ok(task);
}

export async function getTask(
  repo: TaskRepository,
  actor: Actor,
  id: string,
): Promise<Result<Task>> {
  const task = await repo.get(id, actor.boardId);
  return task ? ok(task) : err('NOT_FOUND', 'Task not found');
}

export async function listTasks(
  repo: TaskRepository,
  actor: Actor,
  query: ListTasksQuery,
): Promise<Result<Paginated<Task>>> {
  const { items, total } = await repo.list({
    filter: {
      boardId: actor.boardId,
      statusId: query.statusId,
      priority: query.priority,
      assigneeParticipantId: query.assigneeParticipantId,
      q: query.q,
    },
    sort: query.sort,
    dir: query.dir,
    offset: pageOffset(query.page, query.size),
    limit: query.size,
  });
  return ok({ items, total, page: query.page, size: query.size });
}

export async function updateTask(
  repo: TaskRepository,
  statusRepo: StatusRepository,
  actor: Actor,
  id: string,
  input: UpdateTaskInput,
  publisher?: EventPublisher,
  activityRepo?: ActivityRepository,
): Promise<Result<Task>> {
  // Scope-check a status change first: a cross-board status is invisible → rejected before the write.
  if (input.statusId && !(await statusRepo.getById(input.statusId, actor.boardId)))
    return err('VALIDATION_ERROR', 'Unknown status');
  const task = await repo.update(id, actor.boardId, input);
  if (task) {
    await appendTaskActivity(activityRepo, publisher, actor, 'task.updated', task);
    publishTaskEvent(
      publisher,
      actor.boardId,
      taskUpdated(actor.boardId, actor.participantId, task),
    );
  }
  return task ? ok(task) : err('NOT_FOUND', 'Task not found');
}

export async function moveTask(
  repo: TaskRepository,
  statusRepo: StatusRepository,
  actor: Actor,
  id: string,
  input: MoveTaskInput,
  publisher?: EventPublisher,
  activityRepo?: ActivityRepository,
): Promise<Result<Task>> {
  if (!(await statusRepo.getById(input.statusId, actor.boardId)))
    return err('VALIDATION_ERROR', 'Unknown status');
  const task = await repo.update(id, actor.boardId, input);
  if (task) {
    await appendTaskActivity(activityRepo, publisher, actor, 'task.moved', task);
    publishTaskEvent(publisher, actor.boardId, taskMoved(actor.boardId, actor.participantId, task));
  }
  return task ? ok(task) : err('NOT_FOUND', 'Task not found');
}

export async function deleteTask(
  repo: TaskRepository,
  actor: Actor,
  id: string,
  publisher?: EventPublisher,
  activityRepo?: ActivityRepository,
): Promise<Result<null>> {
  const existing = await repo.get(id, actor.boardId);
  if (!existing) return err('NOT_FOUND', 'Task not found');
  const removed = await repo.delete(id, actor.boardId);
  if (removed) {
    await appendTaskActivity(activityRepo, publisher, actor, 'task.deleted', existing);
    publishTaskEvent(publisher, actor.boardId, taskDeleted(actor.boardId, actor.participantId, id));
  }
  return removed ? ok(null) : err('NOT_FOUND', 'Task not found');
}

// The one "rich" use-case: composes the task and participant repos with real branching. H1 repoints
// assignment onto the board Participant — the legacy User path is gone.
export async function assignTask(
  taskRepo: TaskRepository,
  participantRepo: ParticipantRepository,
  actor: Actor,
  id: string,
  input: AssignTaskInput,
  publisher?: EventPublisher,
  activityRepo?: ActivityRepository,
): Promise<Result<Task>> {
  // Check board scope FIRST: an off-board/absent task returns NOT_FOUND before any assignee lookup, so a
  // caller who can't reach the task can't use this endpoint to probe which participant ids exist. A
  // participant from ANOTHER board is invisible under the board-scoped getById → NOT_FOUND (board IDOR).
  if (input.assigneeParticipantId !== null) {
    const owned = await taskRepo.get(id, actor.boardId);
    if (!owned) return err('NOT_FOUND', 'Task not found');
    const assignee = await participantRepo.getById(input.assigneeParticipantId, actor.boardId);
    if (!assignee) return err('NOT_FOUND', 'Participant not found');
  }
  const task = await taskRepo.update(id, actor.boardId, {
    assigneeParticipantId: input.assigneeParticipantId,
  });
  if (task) {
    await appendTaskActivity(activityRepo, publisher, actor, 'task.updated', task);
    publishTaskEvent(
      publisher,
      actor.boardId,
      taskUpdated(actor.boardId, actor.participantId, task),
    );
  }
  return task ? ok(task) : err('NOT_FOUND', 'Task not found'); // update() re-checks the board scope
}
