import { ok, err, type Result } from '@/core/shared/envelope';
import { pageOffset, type Paginated } from '@/core/shared/pagination';
import type { Actor } from '@/core/shared/actor';
import type { ParticipantRepository } from '@/core/participants/repository';
import type { StatusRepository } from '@/core/statuses/repository';
import type { TaskRepository } from './repository';
import type { Task } from './task';
import type { CreateTaskInput, UpdateTaskInput, AssignTaskInput, ListTasksQuery } from './schema';

// Rich use-case: resolves the status server-side. A supplied statusId is scope-checked (IDOR — a
// foreign/unknown id is invisible → rejected); an absent one falls back to the board's default.
export async function createTask(
  repo: TaskRepository,
  statusRepo: StatusRepository,
  actor: Actor,
  input: CreateTaskInput,
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
): Promise<Result<Task>> {
  // Scope-check a status change first: a cross-board status is invisible → rejected before the write.
  if (input.statusId && !(await statusRepo.getById(input.statusId, actor.boardId)))
    return err('VALIDATION_ERROR', 'Unknown status');
  const task = await repo.update(id, actor.boardId, input);
  return task ? ok(task) : err('NOT_FOUND', 'Task not found');
}

export async function deleteTask(
  repo: TaskRepository,
  actor: Actor,
  id: string,
): Promise<Result<null>> {
  const removed = await repo.delete(id, actor.boardId);
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
  return task ? ok(task) : err('NOT_FOUND', 'Task not found'); // update() re-checks the board scope
}
