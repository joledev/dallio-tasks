'use client';

import { keepPreviousData, useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { api } from '@/app/_lib/api';
import { taskKeys, type TaskListFilters } from '@/app/_lib/query-keys';
import { boardTasksQueryOptions } from '@/app/_lib/board-queries';
import { useOptionalBoard } from '@/app/_components/board-context';
import type { Paginated, TaskDTO } from '@/app/_lib/types';

// Reads the task list keyed by the *effective* filters. This is the shared data seam: under a
// BoardProvider it becomes the token-scoped board query (namespaced key, `enabled: isJoined`, and NO
// `keepPreviousData` so a token change can't flash board A's rows — UI-H1/H2); on the flat owner `/`
// surface (no provider) it keeps the original flat behavior, including `keepPreviousData` for paging.
export function useTasks(effectiveFilters: TaskListFilters) {
  const board = useOptionalBoard();
  const options: UseQueryOptions<Paginated<TaskDTO>> = board
    ? boardTasksQueryOptions(board.token, effectiveFilters, board.isJoined)
    : {
        queryKey: taskKeys.list(effectiveFilters),
        queryFn: () => api.listTasks(effectiveFilters),
        placeholderData: keepPreviousData,
      };
  return useQuery(options);
}
