import type { Task } from './task';
import type { TaskStatus, TaskPriority, TASK_SORT_FIELDS } from './schema';

export type TaskSortField = (typeof TASK_SORT_FIELDS)[number];
type SortDir = 'asc' | 'desc';

export type TaskFilter = {
  ownerId: string; // ALWAYS applied — the IDOR anchor
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
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
  status: TaskStatus; // status server-set
  priority: TaskPriority;
  ownerId: string;
  assigneeId: string | null;
};

export type UpdateTaskData = Partial<Omit<CreateTaskData, 'ownerId'>>;

// ISP: tasks only. get/update/delete require ownerId — ownership is enforced in-query, never as a
// post-fetch check. A miss (wrong owner OR nonexistent) is indistinguishable → maps to 404.
export interface TaskRepository {
  list(params: TaskListParams): Promise<{ items: Task[]; total: number }>; // filtered count included
  get(id: string, ownerId: string): Promise<Task | null>; // owner-scoped
  create(data: CreateTaskData): Promise<Task>;
  update(id: string, ownerId: string, data: UpdateTaskData): Promise<Task | null>; // null = miss/not-owned
  delete(id: string, ownerId: string): Promise<boolean>; // false = miss/not-owned
}
