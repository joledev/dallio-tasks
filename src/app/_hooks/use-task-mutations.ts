'use client';

import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/app/_lib/api';
import { taskKeys } from '@/app/_lib/query-keys';
import { messageFor } from '@/app/_lib/errors';
import { useStatuses } from '@/app/_hooks/use-statuses';
import type { TaskDTO, Paginated } from '@/app/_lib/types';
import type { CreateTaskInput, UpdateTaskInput } from '@/core/tasks/schema';

type ListSnapshot = Array<[QueryKey, Paginated<TaskDTO> | undefined]>;
type OptimisticContext = { previous: ListSnapshot };

// Shared optimistic machinery for the fast inline paths (status / priority / assign): cancel in-flight
// list queries, snapshot every cached page, patch the target item across all pages, and expose a
// rollback. All list caches live under the `['tasks']` prefix.
export function useTaskMutations() {
  const queryClient = useQueryClient();
  const { byId: statusById } = useStatuses();

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

  const patchCachedTask = (id: string, partial: Partial<TaskDTO>) => {
    queryClient.setQueriesData<Paginated<TaskDTO>>({ queryKey: taskKeys.all }, (old) => {
      if (!old) return old;
      return { ...old, items: old.items.map((t) => (t.id === id ? { ...t, ...partial } : t)) };
    });
  };

  const beginOptimistic = async (
    id: string,
    partial: Partial<TaskDTO>,
  ): Promise<OptimisticContext> => {
    await queryClient.cancelQueries({ queryKey: taskKeys.all });
    const previous = queryClient.getQueriesData<Paginated<TaskDTO>>({ queryKey: taskKeys.all });
    patchCachedTask(id, partial);
    return { previous };
  };

  const rollback = (context: OptimisticContext | undefined) => {
    for (const [key, data] of context?.previous ?? []) queryClient.setQueryData(key, data);
  };

  const invalidateTasks = () => queryClient.invalidateQueries({ queryKey: taskKeys.all });

  // Create / delete: no optimistic step — mutate, then invalidate on success. Error toast is shared;
  // callers add their own success toast + dialog close.
  const create = useMutation<TaskDTO, ApiError, CreateTaskInput>({
    mutationFn: (body) => api.createTask(body),
    onSuccess: invalidateTasks,
    onError: (error) => toast.error(messageFor(error)),
  });

  const remove = useMutation<null, ApiError, { id: string }>({
    mutationFn: ({ id }) => api.deleteTask(id),
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
    mutationFn: ({ id, patch }) => api.updateTask(id, patch),
    onMutate: ({ id, patch }) => beginOptimistic(id, toOptimisticPatch(patch)),
    onError: (error, _vars, context) => {
      rollback(context);
      toast.error(messageFor(error));
    },
    onSettled: invalidateTasks,
  });

  const assign = useMutation<
    TaskDTO,
    ApiError,
    { id: string; assigneeId: string | null },
    OptimisticContext
  >({
    mutationFn: ({ id, assigneeId }) => api.assignTask(id, { assigneeId }),
    onMutate: ({ id, assigneeId }) => beginOptimistic(id, { assigneeId }),
    onError: (error, _vars, context) => {
      rollback(context);
      toast.error(messageFor(error));
    },
    onSettled: invalidateTasks,
  });

  return { create, update, remove, assign };
}
