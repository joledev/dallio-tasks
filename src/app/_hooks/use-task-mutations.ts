'use client';

import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, boardApi, ApiError } from '@/app/_lib/api';
import { taskKeys, boardTaskKeys } from '@/app/_lib/query-keys';
import { messageFor } from '@/app/_lib/errors';
import { useStatuses } from '@/app/_hooks/use-statuses';
import { useOptionalBoard } from '@/app/_components/board-context';
import {
  beginOptimisticTaskPatch,
  invalidateTaskLists,
  rollbackTaskPatch,
  type OptimisticContext,
} from '@/app/_lib/board-cache';
import type { TaskDTO } from '@/app/_lib/types';
import type { CreateTaskInput, UpdateTaskInput } from '@/core/tasks/schema';

// Shared optimistic machinery for the fast inline paths (status / priority / assign): cancel in-flight
// list queries, snapshot every cached page, patch the target item across all pages, and expose a
// rollback. Under a BoardProvider the whole thing operates on the token-namespaced key
// (`boardTaskKeys(token).all`); on the flat owner `/` surface it operates on `taskKeys.all`. Assignment
// is re-enabled here (H1 repointed it to board Participants) and only fires from the board's picker.
export function useTaskMutations() {
  const queryClient = useQueryClient();
  const { byId: statusById } = useStatuses();
  const board = useOptionalBoard();
  const token = board?.token ?? null;

  // Select the token-scoped client + cache key when on a board, else the flat ones. Both clients expose
  // the same create/update/delete/assign signatures, so the call sites below don't branch.
  const client = token ? boardApi(token) : api;
  const listKey = token ? boardTaskKeys(token).all : taskKeys.all;

  // A status change now patches an object, not a string: set both `statusId` (the board buckets on it)
  // and the joined `status` StatusRef (the badge/name render off it) so the card re-buckets AND relabels
  // instantly. The full ref is looked up from the cached status list the select already displays.
  const toOptimisticPatch = (patch: UpdateTaskInput): Partial<TaskDTO> => {
    const partial = { ...patch } as Partial<TaskDTO>;
    if (patch.statusId) {
      const status = statusById.get(patch.statusId);
      if (status) partial.status = status;
    }
    return partial;
  };

  const beginOptimistic = async (
    id: string,
    partial: Partial<TaskDTO>,
  ): Promise<OptimisticContext> => {
    return beginOptimisticTaskPatch(queryClient, listKey as QueryKey, id, partial);
  };

  const rollback = (context: OptimisticContext | undefined) => {
    rollbackTaskPatch(queryClient, context);
  };

  const invalidateTasks = () => invalidateTaskLists(queryClient, listKey as QueryKey);

  // Create / delete: no optimistic step — mutate, then invalidate on success. Error toast is shared;
  // callers add their own success toast + dialog close.
  const create = useMutation<TaskDTO, ApiError, CreateTaskInput>({
    mutationFn: (body) => client.createTask(body),
    onSuccess: invalidateTasks,
    onError: (error) => toast.error(messageFor(error)),
  });

  const remove = useMutation<null, ApiError, { id: string }>({
    mutationFn: ({ id }) => client.deleteTask(id),
    onSuccess: invalidateTasks,
    onError: (error) => toast.error(messageFor(error)),
  });

  // Update covers both the edit form (title/description/status/priority) and the inline status/priority
  // selects. Optimistic so an inline status change re-buckets the board card instantly.
  const update = useMutation<
    TaskDTO,
    ApiError,
    { id: string; patch: UpdateTaskInput },
    OptimisticContext
  >({
    mutationFn: ({ id, patch }) => client.updateTask(id, patch),
    onMutate: ({ id, patch }) => beginOptimistic(id, toOptimisticPatch(patch)),
    onError: (error, _vars, context) => {
      rollback(context);
      toast.error(messageFor(error));
    },
    onSettled: invalidateTasks,
  });

  const move = useMutation<
    TaskDTO,
    ApiError,
    { id: string; statusId: string; position: number },
    OptimisticContext
  >({
    mutationFn: ({ id, statusId, position }) => client.moveTask(id, { statusId, position }),
    onMutate: ({ id, statusId, position }) =>
      beginOptimistic(id, toOptimisticPatch({ statusId, position })),
    onError: (error, _vars, context) => {
      rollback(context);
      toast.error(messageFor(error));
    },
    onSettled: invalidateTasks,
  });

  // Assign — targets the board Participant (assigneeParticipantId; null = unassign). Optimistic patch of
  // the cached task with a ROLLBACK if the server rejects (e.g. a cross-board participant id → the
  // server's same-board check fails and the card snaps back to its previous assignee).
  const assign = useMutation<
    TaskDTO,
    ApiError,
    { id: string; assigneeParticipantId: string | null },
    OptimisticContext
  >({
    mutationFn: ({ id, assigneeParticipantId }) => client.assignTask(id, { assigneeParticipantId }),
    onMutate: ({ id, assigneeParticipantId }) => beginOptimistic(id, { assigneeParticipantId }),
    onError: (error, _vars, context) => {
      rollback(context);
      toast.error(messageFor(error));
    },
    onSettled: invalidateTasks,
  });

  return { create, update, move, remove, assign };
}
