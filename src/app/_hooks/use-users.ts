'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/app/_lib/api';
import { userKeys } from '@/app/_lib/query-keys';

// Users back the legacy assignee filter options only. Assignment itself was repointed to board
// Participants (H1), so the per-task assignee name is no longer resolved from this registry — the
// participant picker + name source ships with the board view. Long staleTime: the registry rarely
// changes within a session.
export function useUsers() {
  const query = useQuery({
    queryKey: userKeys.all,
    queryFn: api.listUsers,
    staleTime: 5 * 60_000,
  });

  return { ...query, users: query.data ?? [] };
}
