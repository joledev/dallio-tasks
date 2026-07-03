import { ok, err, type Result } from '@/core/shared/envelope';
import { pageOffset, type Paginated } from '@/core/shared/pagination';
import type { UserRepository } from '@/core/users/repository';
import type { StatusRepository } from '@/core/statuses/repository';
import type { TaskRepository } from './repository';
import type { Task } from './task';
import type { CreateTaskInput, UpdateTaskInput, AssignTaskInput, ListTasksQuery } from './schema';

// Rich use-case: resolves the status server-side. A supplied statusId is scope-checked (IDOR — a
// foreign/unknown id is invisible → rejected); an absent one falls back to the owner's default.
export async function createTask(
  repo: TaskRepository,
  statusRepo: StatusRepository,
  actingUserId: string,
  input: CreateTaskInput,
): Promise<Result<Task>> {
  const statusId = input.statusId
    ? (await statusRepo.getById(input.statusId, actingUserId))?.id
    : (await statusRepo.getDefault(actingUserId))?.id;
  if (!statusId) return err('VALIDATION_ERROR', 'Unknown status');

  const task = await repo.create({
    title: input.title,
    description: input.description ?? null,
    statusId,
    priority: input.priority,
    ownerId: actingUserId, // derived identity, never from the body
    assigneeId: null, // created unassigned
  });
  return ok(task);
}

export async function getTask(
  repo: TaskRepository,
  actingUserId: string,
  id: string,
): Promise<Result<Task>> {
  const task = await repo.get(id, actingUserId);
  return task ? ok(task) : err('NOT_FOUND', 'Task not found');
}

export async function listTasks(
  repo: TaskRepository,
  actingUserId: string,
  query: ListTasksQuery,
): Promise<Result<Paginated<Task>>> {
  const { items, total } = await repo.list({
    filter: {
      ownerId: actingUserId,
      statusId: query.statusId,
      priority: query.priority,
      assigneeId: query.assigneeId,
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
  actingUserId: string,
  id: string,
  input: UpdateTaskInput,
): Promise<Result<Task>> {
  // Scope-check a status change first: a cross-owner status is invisible → rejected before the write.
  if (input.statusId && !(await statusRepo.getById(input.statusId, actingUserId)))
    return err('VALIDATION_ERROR', 'Unknown status');
  const task = await repo.update(id, actingUserId, input);
  return task ? ok(task) : err('NOT_FOUND', 'Task not found');
}

export async function deleteTask(
  repo: TaskRepository,
  actingUserId: string,
  id: string,
): Promise<Result<null>> {
  const removed = await repo.delete(id, actingUserId);
  return removed ? ok(null) : err('NOT_FOUND', 'Task not found');
}

// The one "rich" use-case: composes the task and user repos with real branching.
export async function assignTask(
  taskRepo: TaskRepository,
  userRepo: UserRepository,
  actingUserId: string,
  id: string,
  input: AssignTaskInput,
): Promise<Result<Task>> {
  // Check ownership FIRST: a non-owned/absent task returns NOT_FOUND before any assignee lookup, so a
  // caller who doesn't own the task can't use this endpoint to probe which user ids exist.
  if (input.assigneeId !== null) {
    const owned = await taskRepo.get(id, actingUserId);
    if (!owned) return err('NOT_FOUND', 'Task not found');
    const assignee = await userRepo.getById(input.assigneeId);
    if (!assignee) return err('VALIDATION_ERROR', 'Assignee does not exist');
  }
  const task = await taskRepo.update(id, actingUserId, { assigneeId: input.assigneeId });
  return task ? ok(task) : err('NOT_FOUND', 'Task not found'); // update() re-checks the owner scope
}
