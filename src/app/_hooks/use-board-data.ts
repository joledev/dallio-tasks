'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { boardApi, ApiError } from '@/app/_lib/api';
import { messageFor } from '@/app/_lib/errors';
import { useTasks } from '@/app/_hooks/use-tasks';
import { useStatuses } from '@/app/_hooks/use-statuses';
import { useTaskMutations } from '@/app/_hooks/use-task-mutations';
import {
  boardActivityQueryOptions,
  boardModeQueryOptions,
  boardParticipantsQueryOptions,
  boardPresenceQueryOptions,
  boardProposalsQueryOptions,
} from '@/app/_lib/board-queries';
import { useBoard, type BoardContextValue } from '@/app/_components/board-context';
import { boardModeKeys, boardProposalKeys } from '@/app/_lib/query-keys';
import type { TaskListFilters } from '@/app/_lib/query-keys';
import type { CreateProposalInput, VoteInput, BoardModeInput } from '@/core/proposals/schema';
import type { BoardModeDTO, ProposalDTO } from '@/app/_lib/types';

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
  return useQuery(boardParticipantsQueryOptions(token, board.isJoined, board.present));
}

export function useBoardPresence(token: string) {
  const board = useAssertedBoard(token);
  const query = useQuery(boardPresenceQueryOptions(token, board.isJoined, board.present));
  return {
    ...query,
    participants: query.data?.participants ?? [],
    onlineCount: query.data?.onlineCount ?? 0,
  };
}

export function useBoardActivity(token: string) {
  const board = useAssertedBoard(token);
  const query = useQuery(boardActivityQueryOptions(token, board.isJoined, board.present));
  return { ...query, activity: query.data ?? [] };
}

export function useBoardProposals(token: string) {
  const board = useAssertedBoard(token);
  const query = useQuery(boardProposalsQueryOptions(token, board.isJoined));
  return { ...query, proposals: query.data ?? [] };
}

export function useBoardMode(token: string) {
  const board = useAssertedBoard(token);
  const query = useQuery(boardModeQueryOptions(token, board.isJoined, board.initialMode));
  return { ...query, mode: query.data?.mode ?? board.initialMode };
}

export function useBoardProposalMutations(token: string) {
  const board = useAssertedBoard(token);
  const queryClient = useQueryClient();
  const client = boardApi(token);

  const create = useMutation<ProposalDTO, ApiError, CreateProposalInput>({
    mutationFn: (body) => client.proposals.create(body),
    onSuccess: (proposal) => {
      queryClient.setQueryData<ProposalDTO[]>(boardProposalKeys(token).all, (old = []) => [
        proposal,
        ...old.filter((item) => item.id !== proposal.id),
      ]);
    },
    onError: (error) => toast.error(messageFor(error)),
  });

  const vote = useMutation<ProposalDTO, ApiError, { id: string; value: VoteInput['value'] }>({
    mutationFn: ({ id, value }) => client.proposals.vote(id, { value }),
    onSuccess: (proposal) => {
      queryClient.setQueryData<ProposalDTO[]>(boardProposalKeys(token).all, (old = []) =>
        old.map((item) => (item.id === proposal.id ? proposal : item)),
      );
    },
    onError: (error) => toast.error(messageFor(error)),
  });

  const setMode = useMutation<BoardModeDTO, ApiError, BoardModeInput>({
    mutationFn: (body) => client.mode.set(body),
    onSuccess: (mode) => {
      queryClient.setQueryData<BoardModeDTO>(boardModeKeys(token).all, mode);
      if (mode.mode === 'DIRECT')
        queryClient.removeQueries({ queryKey: boardProposalKeys(token).all });
    },
    onError: (error) => toast.error(messageFor(error)),
  });

  return { create, vote, setMode, canMutate: board.isJoined };
}
