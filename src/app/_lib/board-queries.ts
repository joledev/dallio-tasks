import type { UseQueryOptions } from '@tanstack/react-query';
import { boardApi } from '@/app/_lib/api';
import {
  boardTaskKeys,
  boardStatusKeys,
  boardParticipantKeys,
  boardPresenceKeys,
  boardActivityKeys,
  type TaskListFilters,
} from '@/app/_lib/query-keys';
import type {
  ActivityDTO,
  Paginated,
  TaskDTO,
  StatusDTO,
  GuestParticipantDTO,
  PresenceSnapshotDTO,
} from '@/app/_lib/types';

// Pure TanStack `useQuery` option builders for the guest board. Kept as plain functions (NOT hooks) so
// the same token-scoped key + fetcher + `enabled` gate is shared by BOTH the context-aware shared hooks
// (`useTasks`/`useStatuses`, which read the token from BoardProvider) and the explicit token hooks
// (`useBoardTasks`/`useBoardStatuses`/`useBoardParticipants`). No logic is duplicated between them.
//
// UI-H1: none of these sets `placeholderData: keepPreviousData` — on a token change the board subtree is
// remounted by key, and nothing carries board A's rows into board B.
// UI-H2: `enabled: isJoined` — until the server-confirmed participant exists, the query never fires.

export function boardTasksQueryOptions(
  token: string,
  filters: TaskListFilters,
  isJoined: boolean,
): UseQueryOptions<Paginated<TaskDTO>> {
  return {
    queryKey: boardTaskKeys(token).list(filters),
    queryFn: () => boardApi(token).listTasks(filters),
    enabled: isJoined,
  };
}

export function boardStatusesQueryOptions(
  token: string,
  isJoined: boolean,
): UseQueryOptions<StatusDTO[]> {
  return {
    queryKey: boardStatusKeys(token).all,
    queryFn: () => boardApi(token).statuses.list(),
    staleTime: 5 * 60_000,
    enabled: isJoined,
  };
}

export function boardParticipantsQueryOptions(
  token: string,
  isJoined: boolean,
  present = false,
): UseQueryOptions<GuestParticipantDTO[]> {
  return {
    queryKey: boardParticipantKeys(token).all,
    queryFn: () => boardApi(token, present).listParticipants(),
    staleTime: 5 * 60_000,
    enabled: isJoined,
  };
}

export function boardPresenceQueryOptions(
  token: string,
  isJoined: boolean,
  present = false,
): UseQueryOptions<PresenceSnapshotDTO> {
  return {
    queryKey: boardPresenceKeys(token).all,
    queryFn: () => boardApi(token, present).presence(),
    refetchInterval: 25_000,
    enabled: isJoined,
  };
}

export function boardActivityQueryOptions(
  token: string,
  isJoined: boolean,
  present = false,
): UseQueryOptions<ActivityDTO[]> {
  return {
    queryKey: boardActivityKeys(token).all,
    queryFn: () => boardApi(token, present).activity(),
    enabled: isJoined,
  };
}
