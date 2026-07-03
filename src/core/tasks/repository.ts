import type { Prisma } from '@prisma/client';
import type { Task } from './task';
import type { TaskPriority, TASK_SORT_FIELDS } from './schema';

export type TaskSortField = (typeof TASK_SORT_FIELDS)[number];
type SortDir = 'asc' | 'desc';

export type TaskFilter = {
  boardId: string; // ALWAYS applied — the IDOR anchor
  statusId?: string;
  priority?: TaskPriority;
  assigneeParticipantId?: string; // H1: filter by the board Participant assignee
  q?: string; // title contains, case-insensitive
};

export type TaskListParams = {
  filter: TaskFilter;
  sort: TaskSortField;
  dir: SortDir;
  offset: number;
  limit: number;
};

export type CreateTaskData = {
  title: string;
  description: string | null;
  statusId: string; // resolved server-side (default or scope-checked)
  priority: TaskPriority;
  boardId: string; // IDOR anchor
  createdByParticipantId: string | null; // guest attribution (null for owner-direct)
  assigneeParticipantId: string | null; // H1: → Participant (same-board check in assignTask)
  position?: number; // optional on create: Prisma default keeps legacy callers simple
};

// Cannot move a task across boards or rewrite its creator, so both are dropped from the update surface.
export type UpdateTaskData = Partial<Omit<CreateTaskData, 'boardId' | 'createdByParticipantId'>>;

// Sort allowlist as an injection-safe order-by builder: each domain field maps to a FIXED structured
// Prisma orderBy. `status` orders by the joined Status.position (not the removed enum). Zod restricts
// `sort` to TASK_SORT_FIELDS, so no user string ever reaches a column identifier. Prisma types live at
// this repo boundary only.
export const TASK_ORDER_BY: Record<
  TaskSortField,
  (dir: SortDir) => Prisma.TaskOrderByWithRelationInput
> = {
  createdAt: (dir) => ({ createdAt: dir }),
  priority: (dir) => ({ priority: dir }),
  title: (dir) => ({ title: dir }),
  status: (dir) => ({ status: { position: dir } }),
};

// ISP: tasks only. get/update/delete require boardId — scoping is enforced in-query, never as a
// post-fetch check. A miss (wrong board OR nonexistent) is indistinguishable → maps to 404.
export interface TaskRepository {
  list(params: TaskListParams): Promise<{ items: Task[]; total: number }>; // filtered count included
  get(id: string, boardId: string): Promise<Task | null>; // board-scoped
  create(data: CreateTaskData): Promise<Task>;
  update(id: string, boardId: string, data: UpdateTaskData): Promise<Task | null>; // null = miss/off-board
  delete(id: string, boardId: string): Promise<boolean>; // false = miss/off-board
}
