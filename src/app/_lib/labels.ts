import { TASK_SORT_FIELDS, type TaskStatus, type TaskPriority } from '@/core/tasks/schema';

// Single source of truth for the human-facing enum/sort copy shared across every task UI surface.
export const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

export const SORT_LABEL: Record<(typeof TASK_SORT_FIELDS)[number], string> = {
  createdAt: 'Created',
  priority: 'Priority',
  status: 'Status',
  title: 'Title',
};
