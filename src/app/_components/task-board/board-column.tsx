'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTaskMutations } from '@/app/_hooks/use-task-mutations';
import { TaskCard } from './task-card';
import type { TaskDTO, StatusRef } from '@/app/_lib/types';
import { cn } from '@/lib/utils';

export function BoardColumn({
  status,
  tasks,
  collapsed,
  onToggle,
}: {
  status: StatusRef;
  tasks: TaskDTO[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  // Drop target for the DnD enhancement. `id`/`data.statusId` is the target status the board writes via
  // the existing update mutation on drop; `isOver` drives the drag-over highlight. The ref stays on the
  // <section> so the column remains a valid drop target even while collapsed (its body is hidden).
  const { setNodeRef, isOver } = useDroppable({ id: status.id, data: { statusId: status.id } });
  const bodyId = `board-column-body-${status.id}`;

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`board-column-${status.id}`}
      className={cn(
        'bg-muted/35 flex w-full flex-col rounded-lg border transition-[width,color,background-color,border-color] duration-200 ease-out motion-reduce:transition-none',
        // Collapse along the layout axis: mobile stack shrinks to a header-only strip; the md+ row
        // shrinks to a ~48px vertical rail while the other columns absorb the freed width via flex-1.
        collapsed
          ? 'md:w-12 md:flex-none'
          : 'min-h-[18rem] md:max-w-[22rem] md:min-w-[16rem] md:flex-1',
        isOver && 'border-primary bg-primary/5 ring-primary/40 ring-2',
      )}
    >
      {/* The whole header is one tap target (≥44px). Accessible name comes from the visible label +
          count; the chevron is decorative (state is on aria-expanded). */}
      <h2 id={`board-column-${status.id}`}>
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onClick={onToggle}
          className={cn(
            'focus-visible:ring-ring flex min-h-11 w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium focus-visible:ring-2 focus-visible:outline-none',
            collapsed ? 'rounded-lg' : 'rounded-t-lg border-b',
            // On a collapsed rail (md+) the header runs the full height and reads top-to-bottom.
            collapsed && 'md:h-full md:flex-col md:gap-3 md:px-2',
          )}
        >
          {collapsed ? (
            <ChevronRight aria-hidden className="text-muted-foreground size-4 shrink-0" />
          ) : (
            <ChevronDown aria-hidden className="text-muted-foreground size-4 shrink-0" />
          )}
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              collapsed && 'md:rotate-180 md:[writing-mode:vertical-rl]',
            )}
          >
            {status.name}
          </span>
          <span className="bg-background text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-xs">
            {tasks.length}
          </span>
        </button>
      </h2>

      {/* `hidden` (not unmount) keeps the aria-controls target present and removes the body from
          layout + the a11y tree when collapsed. */}
      <div id={bodyId} hidden={collapsed} className="flex flex-1 flex-col gap-3 p-3">
        {tasks.length > 0 ? (
          tasks.map((task) => <TaskCard key={task.id} task={task} />)
        ) : (
          <div className="text-muted-foreground bg-background/50 flex flex-1 items-center justify-center rounded-md border border-dashed px-4 py-8 text-center text-sm">
            No tasks
          </div>
        )}
        <ColumnQuickAdd statusId={status.id} />
      </div>
    </section>
  );
}

// Trello-style inline add at the bottom of a column: a subtle "Add task" affordance that reveals an
// autofocused title input creating a task directly on this column's status. Reuses the shared create
// mutation (no second write path); the mutation's invalidate refreshes the column. Escape or an empty
// blur cancels; a successful add clears the field and stays open for rapid entry.
function ColumnQuickAdd({ statusId }: { statusId: string }) {
  const { create } = useTaskMutations();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');

  const cancel = () => {
    setTitle('');
    setAdding(false);
  };

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      cancel();
      return;
    }
    // Clear the field only once the task is created, so a failed create keeps the typed title.
    create.mutate(
      { title: trimmed, statusId, priority: 'MEDIUM' }, // default priority
      { onSuccess: () => setTitle('') },
    );
  };

  if (!adding) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="text-muted-foreground w-full justify-start"
        onClick={() => setAdding(true)}
      >
        <Plus className="size-4" />
        Add task
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title"
        aria-label="New task title"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            cancel();
          }
        }}
        onBlur={() => {
          if (title.trim() === '') setAdding(false);
        }}
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={submit} disabled={create.isPending}>
          Add
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={cancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
