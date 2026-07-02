'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusEnum, type TaskStatus } from '@/core/tasks/schema';
import { STATUS_LABEL } from '@/app/_lib/labels';
import { useTaskMutations } from '@/app/_hooks/use-task-mutations';
import { cn } from '@/lib/utils';

export function StatusSelect({
  taskId,
  status,
  className,
}: {
  taskId: string;
  status: TaskStatus;
  className?: string;
}) {
  const { update } = useTaskMutations();

  return (
    <Select
      value={status}
      onValueChange={(value) =>
        update.mutate({ id: taskId, patch: { status: value as TaskStatus } })
      }
      disabled={update.isPending}
    >
      <SelectTrigger size="sm" className={cn('w-[140px]', className)} aria-label="Status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {StatusEnum.options.map((value) => (
          <SelectItem key={value} value={value}>
            {STATUS_LABEL[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
