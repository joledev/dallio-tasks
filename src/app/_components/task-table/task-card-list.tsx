'use client';

import { AssignControl } from '@/app/_components/assign-control';
import { StatusBadge, PriorityBadge } from '@/app/_components/badges';
import { PrioritySelect } from '@/app/_components/priority-select';
import { StatusSelect } from '@/app/_components/status-select';
import { formatDate } from '@/app/_lib/format';
import type { TaskDTO } from '@/app/_lib/types';
import { cn } from '@/lib/utils';
import { TaskRowActions } from './task-row-actions';

// Mobile counterpart to the md+ table: one card per task, same field set as a table row (title,
// status, priority, assignee, created, actions) with nothing hidden. Reuses the Board card's
// container classes and the shared controls, so a task reads the same across every view. The
// controls are made touch-height (`h-11!` = 44px) — the `!` beats the trigger's higher-specificity
// `data-[size=sm]:h-8`, which a plain `h-11` would lose to.
export function TaskCardList({ items, className }: { items: TaskDTO[]; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {items.map((task) => (
        <article
          key={task.id}
          className="bg-card text-card-foreground rounded-lg border p-4 shadow-xs"
        >
          <div className="flex items-start gap-2">
            <h3 className="line-clamp-2 min-w-0 flex-1 text-sm font-medium break-words">
              {task.title}
            </h3>
            <TaskRowActions task={task} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
          </div>

          <div className="mt-4 grid gap-2">
            <StatusSelect taskId={task.id} statusId={task.statusId} className="h-11! w-full" />
            <PrioritySelect taskId={task.id} priority={task.priority} className="h-11! w-full" />
            <AssignControl
              taskId={task.id}
              assigneeParticipantId={task.assigneeParticipantId}
              className="h-11! w-full"
            />
          </div>

          <p className="text-muted-foreground mt-3 text-xs">Created {formatDate(task.createdAt)}</p>
        </article>
      ))}
    </div>
  );
}
