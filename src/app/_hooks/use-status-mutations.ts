'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, boardApi, ApiError } from '@/app/_lib/api';
import { statusKeys, taskKeys, boardStatusKeys, boardTaskKeys } from '@/app/_lib/query-keys';
import { useOptionalBoard } from '@/app/_components/board-context';
import type { StatusDTO } from '@/app/_lib/types';
import type { CreateStatusInput } from '@/core/statuses/schema';

// Create a status, then refresh the status list (new option/column appears) and the task list (the
// board renders a column per status). Board-aware: under a BoardProvider it creates against the
// token-scoped statuses and invalidates the token-namespaced keys; on the flat `/` surface it uses the
// flat keys. The single caller (the inline add-status field) awaits `mutateAsync` and surfaces a
// CONFLICT (duplicate name) on its own field, so no shared error toast lives here.
export function useStatusMutations() {
  const queryClient = useQueryClient();
  const board = useOptionalBoard();
  const token = board?.token ?? null;

  const client = token ? boardApi(token) : api;
  const statusKey = token ? boardStatusKeys(token).all : statusKeys.all;
  const taskKey = token ? boardTaskKeys(token).all : taskKeys.all;

  const create = useMutation<StatusDTO, ApiError, CreateStatusInput>({
    mutationFn: (body) => client.statuses.create(body),
    onSuccess: (created) => {
      // Insert the new status into the cached list synchronously so a create-and-select finds a
      // matching <SelectItem> in the same render — otherwise the Radix Select momentarily holds a
      // value with no item and drops it before the refetch lands. Then invalidate for consistency.
      queryClient.setQueryData<StatusDTO[]>(statusKey, (old) =>
        old ? [...old, created].sort((a, b) => a.position - b.position) : [created],
      );
      void queryClient.invalidateQueries({ queryKey: statusKey });
      void queryClient.invalidateQueries({ queryKey: taskKey });
    },
  });

  return { create };
}
