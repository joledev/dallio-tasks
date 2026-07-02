'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PriorityEnum, type TaskPriority } from '@/core/tasks/schema';
import { PRIORITY_LABEL } from '@/app/_lib/labels';
import { useTaskMutations } from '@/app/_hooks/use-task-mutations';
import { cn } from '@/lib/utils';

export function PrioritySelect({
  taskId,
  priority,
  className,
}: {
  taskId: string;
  priority: TaskPriority;
  className?: string;
}) {
  const { update } = useTaskMutations();

  return (
    <Select
      value={priority}
      onValueChange={(value) =>
        update.mutate({ id: taskId, patch: { priority: value as TaskPriority } })
      }
      disabled={update.isPending}
    >
      <SelectTrigger size="sm" className={cn('w-[120px]', className)} aria-label="Priority">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PriorityEnum.options.map((value) => (
          <SelectItem key={value} value={value}>
            {PRIORITY_LABEL[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
