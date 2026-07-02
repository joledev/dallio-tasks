'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/app/_lib/api';
import { taskKeys, type TaskListFilters } from '@/app/_lib/query-keys';

// Reads the task list keyed by the *effective* filters. `keepPreviousData` avoids an empty flash
// while paging, tweaking filters, or toggling views — the board's effective query drops `status` and
// forces size 100, so its key differs from the table's and switching views triggers a refetch.
export function useTasks(effectiveFilters: TaskListFilters) {
  return useQuery({
    queryKey: taskKeys.list(effectiveFilters),
    queryFn: () => api.listTasks(effectiveFilters),
    placeholderData: keepPreviousData,
  });
}
