import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PRIORITY_LABEL } from '@/app/_lib/labels';
import type { TaskPriority, StatusRef, StatusColor } from '@/app/_lib/types';

// Status color is a closed palette TOKEN (never free-form hex). Each token maps to a bg/text pair that
// reuses the existing zinc-based tokens; a null color falls back to neutral zinc. The name text is
// always rendered, so color is never the only signal (a11y §3).
const STATUS_COLOR_CLASS: Record<StatusColor, string> = {
  zinc: 'border-transparent bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100',
  blue: 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  green: 'border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
  amber: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  red: 'border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  violet:
    'border-transparent bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
  rose: 'border-transparent bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
};

const PRIORITY_CLASS: Record<TaskPriority, string> = {
  LOW: 'border-transparent bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  MEDIUM: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  HIGH: 'border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
};

export function StatusBadge({ status, className }: { status: StatusRef; className?: string }) {
  return (
    <Badge className={cn(STATUS_COLOR_CLASS[status.color ?? 'zinc'], className)}>
      {status.name}
    </Badge>
  );
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
