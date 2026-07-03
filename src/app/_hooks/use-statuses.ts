'use client';

import { useMemo } from 'react';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { api } from '@/app/_lib/api';
import { statusKeys } from '@/app/_lib/query-keys';
import { boardStatusesQueryOptions } from '@/app/_lib/board-queries';
import { useOptionalBoard } from '@/app/_components/board-context';
import type { StatusDTO } from '@/app/_lib/types';

// The status registry drives the board columns, every status select, and the id→status lookup that
// badges/labels and the optimistic task patch need. Ordered by position (the server orders the list).
// Long staleTime: statuses rarely change within a session (a create invalidates this key).
//
// Shared data seam: under a BoardProvider it reads the token-scoped statuses (namespaced key, gated on
// `isJoined`); on the flat `/` surface it reads the flat statuses. Same shape either way.
export function useStatuses() {
  const board = useOptionalBoard();
  const options: UseQueryOptions<StatusDTO[]> = board
    ? boardStatusesQueryOptions(board.token, board.isJoined)
    : { queryKey: statusKeys.all, queryFn: api.statuses.list, staleTime: 5 * 60_000 };
  const query = useQuery(options);

  const byId = useMemo(() => {
    const map = new Map<string, StatusDTO>();
    for (const status of query.data ?? []) map.set(status.id, status);
    return map;
  }, [query.data]);

  return { ...query, statuses: query.data ?? [], byId };
}
