import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { STATUS_LABEL, PRIORITY_LABEL } from '@/app/_lib/labels';
import type { TaskStatus, TaskPriority } from '@/app/_lib/types';

const STATUS_CLASS: Record<TaskStatus, string> = {
  TODO: 'border-transparent bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100',
  IN_PROGRESS: 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  DONE: 'border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
};

const PRIORITY_CLASS: Record<TaskPriority, string> = {
  LOW: 'border-transparent bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  MEDIUM: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  HIGH: 'border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
};

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return <Badge className={cn(STATUS_CLASS[status], className)}>{STATUS_LABEL[status]}</Badge>;
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  return (
    <Badge className={cn(PRIORITY_CLASS[priority], className)}>{PRIORITY_LABEL[priority]}</Badge>
  );
}
