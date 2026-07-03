import { TASK_SORT_FIELDS, type TaskPriority } from '@/core/tasks/schema';

// Single source of truth for the human-facing priority/sort copy shared across every task UI surface.
// Status names now come from the live status list (data-driven), so there is no STATUS_LABEL constant.
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
