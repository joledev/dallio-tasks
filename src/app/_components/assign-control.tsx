'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUsers } from '@/app/_hooks/use-users';
import { useTaskMutations } from '@/app/_hooks/use-task-mutations';
import { cn } from '@/lib/utils';

// Radix Select forbids an empty-string value, so "Unassigned" gets a sentinel mapped back to `null`.
const UNASSIGNED = '__unassigned__';

export function AssignControl({
  taskId,
  assigneeId,
  className,
}: {
  taskId: string;
  assigneeId: string | null;
  className?: string;
}) {
  const { users, isLoading } = useUsers();
  const { assign } = useTaskMutations();

  return (
    <Select
      value={assigneeId ?? UNASSIGNED}
      onValueChange={(value) =>
        assign.mutate({ id: taskId, assigneeId: value === UNASSIGNED ? null : value })
      }
      disabled={assign.isPending || isLoading}
    >
      <SelectTrigger size="sm" className={cn('w-[160px]', className)} aria-label="Assignee">
        <SelectValue placeholder="Unassigned" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
        {users.length > 0 ? <SelectSeparator /> : null}
        {users.map((user) => (
          <SelectItem key={user.id} value={user.id}>
            {user.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
