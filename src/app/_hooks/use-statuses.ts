'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/app/_lib/api';
import { statusKeys } from '@/app/_lib/query-keys';
import type { StatusDTO } from '@/app/_lib/types';

// The status registry drives the board columns, every status select, and the id→status lookup that
// badges/labels and the optimistic task patch need. Ordered by position (the server orders the list).
// Long staleTime: statuses rarely change within a session (a create invalidates this key).
export function useStatuses() {
  const query = useQuery({
    queryKey: statusKeys.all,
    queryFn: api.statuses.list,
    staleTime: 5 * 60_000,
  });

  const byId = useMemo(() => {
    const map = new Map<string, StatusDTO>();
    for (const status of query.data ?? []) map.set(status.id, status);
    return map;
  }, [query.data]);

  return { ...query, statuses: query.data ?? [], byId };
}
