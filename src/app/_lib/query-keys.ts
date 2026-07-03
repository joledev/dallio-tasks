import type { ListTasksQuery } from '@/core/tasks/schema';

// The effective REST query that both feeds `api.listTasks` and keys the cache. It reuses the
// server's parsed `ListTasksQuery` shape so the client and server filter contracts can't drift.
export type TaskListFilters = ListTasksQuery;

// Keying the list by the *exact* filter object gives every filter/sort/page combination its own
// cache entry. Table and Board send different effective queries, so each keeps its own entry.
export const taskKeys = {
  all: ['tasks'] as const,
  list: (f: TaskListFilters) => ['tasks', 'list', f] as const,
};

export const userKeys = {
  all: ['users'] as const,
};

export const statusKeys = {
  all: ['statuses'] as const,
};
