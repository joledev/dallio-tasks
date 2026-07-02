'use client';

import { useDroppable } from '@dnd-kit/core';
import { TaskCard } from './task-card';
import { STATUS_LABEL } from '@/app/_lib/labels';
import type { TaskDTO, TaskStatus } from '@/app/_lib/types';
import { cn } from '@/lib/utils';

export function BoardColumn({ status, tasks }: { status: TaskStatus; tasks: TaskDTO[] }) {
  // Drop target for the DnD enhancement. `id`/`data.status` is the target status the board writes via
  // the existing update mutation on drop; `isOver` drives the drag-over highlight.
  const { setNodeRef, isOver } = useDroppable({ id: status, data: { status } });

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`board-column-${status}`}
      className={cn(
        'bg-muted/35 flex min-h-[18rem] min-w-[18rem] flex-1 flex-col rounded-lg border transition-colors',
        isOver && 'border-primary bg-primary/5 ring-primary/40 ring-2',
      )}
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 id={`board-column-${status}`} className="text-sm font-medium">
          {STATUS_LABEL[status]}
        </h2>
        <span className="bg-background text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
          {tasks.length}
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-3 p-3">
        {tasks.length > 0 ? (
          tasks.map((task) => <TaskCard key={task.id} task={task} />)
        ) : (
          <div className="text-muted-foreground bg-background/50 flex flex-1 items-center justify-center rounded-md border border-dashed px-4 py-8 text-center text-sm">
            No tasks
          </div>
        )}
      </div>
    </section>
  );
}
