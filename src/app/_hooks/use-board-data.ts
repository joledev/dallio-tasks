'use client';

import { useQuery } from '@tanstack/react-query';
import { useTasks } from '@/app/_hooks/use-tasks';
import { useStatuses } from '@/app/_hooks/use-statuses';
import { useTaskMutations } from '@/app/_hooks/use-task-mutations';
import {
  boardActivityQueryOptions,
  boardParticipantsQueryOptions,
  boardPresenceQueryOptions,
} from '@/app/_lib/board-queries';
import { useBoard, type BoardContextValue } from '@/app/_components/board-context';
import type { TaskListFilters } from '@/app/_lib/query-keys';

// The token-explicit board hooks. The shared `useTasks/useStatuses/useTaskMutations` already read the
// token from BoardProvider (so the reused board/table/card components stay token-scoped without edits);
// these thin wrappers are the token-in-signature form of the same hooks. Each asserts the passed token
// matches the board in scope, so a caller can't accidentally cross wires. All inherit `enabled: isJoined`
// (UI-H2) and the no-`keepPreviousData` policy (UI-H1) from the shared data seam / query builders.

// Reads the board in scope and guards that the caller's token matches it (a caught programming error).
function useAssertedBoard(token: string): BoardContextValue {
  const board = useBoard();
  if (token !== board.token) {
    throw new Error(`Board hook token mismatch: got "${token}", provider is "${board.token}"`);
  }
  return board;
}

export function useBoardTasks(token: string, filters: TaskListFilters) {
  useAssertedBoard(token);
  return useTasks(filters);
}

export function useBoardStatuses(token: string) {
  useAssertedBoard(token);
  return useStatuses();
}

export function useBoardTaskMutations(token: string) {
  useAssertedBoard(token);
  return useTaskMutations();
}

// The participant picker + assignee-filter source. Distinct from the flat surface (which has no
// participants concept), so this is its own token-scoped query rather than a wrapper.
export function useBoardParticipants(token: string) {
  const board = useAssertedBoard(token);
  return useQuery(boardParticipantsQueryOptions(token, board.isJoined));
}

export function useBoardPresence(token: string) {
  const board = useAssertedBoard(token);
  const query = useQuery(boardPresenceQueryOptions(token, board.isJoined));
  return {
    ...query,
    participants: query.data?.participants ?? [],
    onlineCount: query.data?.onlineCount ?? 0,
  };
}

export function useBoardActivity(token: string) {
  const board = useAssertedBoard(token);
  const query = useQuery(boardActivityQueryOptions(token, board.isJoined));
  return { ...query, activity: query.data ?? [] };
}
