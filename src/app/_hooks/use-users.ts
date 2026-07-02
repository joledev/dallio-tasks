'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/app/_lib/api';
import { userKeys } from '@/app/_lib/query-keys';
import type { UserDTO } from '@/app/_lib/types';

// Users are the assignee-picker options and the `assigneeId -> name` source for rows/cards. The Task
// carries only `assigneeId` (the API never denormalizes the name), so we join client-side here.
// Long staleTime: the registry rarely changes within a session.
export function useUsers() {
  const query = useQuery({
    queryKey: userKeys.all,
    queryFn: api.listUsers,
    staleTime: 5 * 60_000,
  });

  const usersById = useMemo(() => {
    const map = new Map<string, UserDTO>();
    for (const user of query.data ?? []) map.set(user.id, user);
    return map;
  }, [query.data]);

  const nameFor = (assigneeId: string | null): string | null =>
    assigneeId ? (usersById.get(assigneeId)?.name ?? null) : null;

  return { ...query, users: query.data ?? [], nameFor };
}
