'use client';

import { StatusField } from '@/app/_components/status-field';
import { useTaskMutations } from '@/app/_hooks/use-task-mutations';
import { cn } from '@/lib/utils';

// Inline status control on a card/row: the shared data-driven field wired to the update mutation.
// A change writes `statusId`; the mutation's optimistic patch re-buckets the board and relabels the
// badge from the cached status list. The add-status affordance selects the new status in place.
export function StatusSelect({
  taskId,
  statusId,
  className,
}: {
  taskId: string;
  statusId: string;
  className?: string;
}) {
  const { update } = useTaskMutations();

  return (
    <StatusField
      value={statusId}
      onChange={(id) => update.mutate({ id: taskId, patch: { statusId: id } })}
      disabled={update.isPending}
      size="sm"
      triggerClassName={cn('w-[160px]', className)}
    />
  );
}
