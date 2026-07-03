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

// Token-namespaced keys for the guest board (`/b/[token]`). Every key is prefixed with
// `['board', token, …]`, so two boards NEVER share a cache entry and `removeQueries({ queryKey:
// boardKeys(token) })` wipes exactly one board's tasks/statuses/participants and nothing else
// (UI-H1/H2 cross-board isolation). These live alongside — not replacing — the flat owner keys above.
export const boardKeys = (token: string) => ['board', token] as const;

export const boardTaskKeys = (token: string) => ({
  all: [...boardKeys(token), 'tasks'] as const,
  list: (f: TaskListFilters) => [...boardKeys(token), 'tasks', 'list', f] as const,
});

export const boardStatusKeys = (token: string) => ({
  all: [...boardKeys(token), 'statuses'] as const,
});

export const boardParticipantKeys = (token: string) => ({
  all: [...boardKeys(token), 'participants'] as const,
});

export const boardPresenceKeys = (token: string) => ({
  all: [...boardKeys(token), 'presence'] as const,
});

export const boardActivityKeys = (token: string) => ({
  all: [...boardKeys(token), 'activity'] as const,
});
