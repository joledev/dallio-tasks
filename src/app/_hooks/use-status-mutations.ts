'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/app/_lib/api';
import { statusKeys, taskKeys } from '@/app/_lib/query-keys';
import type { StatusDTO } from '@/app/_lib/types';
import type { CreateStatusInput } from '@/core/statuses/schema';

// Create a status, then refresh the status list (new option/column appears) and the task list (the
// board renders a column per status). The single caller (the inline add-status field) awaits
// `mutateAsync` and surfaces a CONFLICT (duplicate name) on its own field, so no shared error toast
// lives here.
export function useStatusMutations() {
  const queryClient = useQueryClient();

  const create = useMutation<StatusDTO, ApiError, CreateStatusInput>({
    mutationFn: (body) => api.statuses.create(body),
    onSuccess: (created) => {
      // Insert the new status into the cached list synchronously so a create-and-select finds a
      // matching <SelectItem> in the same render — otherwise the Radix Select momentarily holds a
      // value with no item and drops it before the refetch lands. Then invalidate for consistency.
      queryClient.setQueryData<StatusDTO[]>(statusKeys.all, (old) =>
        old ? [...old, created].sort((a, b) => a.position - b.position) : [created],
      );
      void queryClient.invalidateQueries({ queryKey: statusKeys.all });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });

  return { create };
}
