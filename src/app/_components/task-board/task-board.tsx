'use client';

import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/app/_components/states';
import { useTaskFilters } from '@/app/_hooks/use-task-filters';
import { useTaskMutations } from '@/app/_hooks/use-task-mutations';
import { useTasks } from '@/app/_hooks/use-tasks';
import { useStatuses } from '@/app/_hooks/use-statuses';
import type { TaskDTO } from '@/app/_lib/types';
import { BoardColumn } from './board-column';
import { TaskCard, TaskCardOverlay } from './task-card';

// Columns come from the ordered status list, so grouping buckets by `statusId` into known columns only
// (a custom column with no tasks still renders — its key is seeded with an empty array). Tasks whose
// statusId is not in the list are handled separately by the "Unsorted" safeguard so nothing vanishes.
function groupByStatus(tasks: TaskDTO[], statusIds: string[]): Record<string, TaskDTO[]> {
  const groups: Record<string, TaskDTO[]> = {};
  for (const id of statusIds) groups[id] = [];
  for (const task of tasks) groups[task.statusId]?.push(task);
  return groups;
}

export function TaskBoard() {
  const { effectiveFilters, clear, hasActiveFilters } = useTaskFilters();
  const { data, isLoading, isError, error, refetch } = useTasks(effectiveFilters);
  const { statuses, isLoading: statusesLoading } = useStatuses();
  const { update } = useTaskMutations();
  const [activeTask, setActiveTask] = useState<TaskDTO | null>(null);

  // Per-session focus chrome (not query state): a set of collapsed status ids. Empty = all expanded.
  // Keyed by status id so it survives custom/renamed statuses with no schema or URL coupling.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggleColumn = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // PointerSensor covers mouse and touch, and its small activation distance keeps taps/clicks on the
  // grip from turning into drags. KeyboardSensor makes the board operable without a pointer.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    setActiveTask(data?.items.find((task) => task.id === id) ?? null);
  };

  // DnD is just another trigger for the existing update mutation (optimistic re-bucket + rollback are
  // handled there — no second write path). A drop onto the same column is a no-op.
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;
    const from = active.data.current?.statusId as string | undefined;
    const to = (over.data.current?.statusId ?? over.id) as string;
    if (!to || to === from) return;
    update.mutate({ id: String(active.id), patch: { statusId: to } });
  };

  if (isLoading || statusesLoading) {
    // Skeleton one column per known status (or a small fixed count before the list loads).
    const skeletons = statuses.length > 0 ? statuses.map((s) => s.id) : ['a', 'b', 'c'];
    return (
      <div className="flex flex-col gap-3 md:flex-row md:overflow-x-auto md:pb-2">
        {skeletons.map((key) => (
          <LoadingState
            key={key}
            rows={4}
            className="w-full rounded-lg border p-3 md:min-w-[16rem] md:flex-1"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return <ErrorState error={error} onRetry={() => void refetch()} />;
  }

  const tasks = data?.items ?? [];

  if (tasks.length === 0) {
    return (
      <EmptyState
        title={hasActiveFilters ? 'No tasks match your filters' : 'No tasks yet'}
        description={
          hasActiveFilters
            ? 'Clear filters to see the full board.'
            : 'Create your first task to start filling the board.'
        }
        action={
          hasActiveFilters ? (
            <Button variant="outline" size="sm" onClick={clear}>
              Clear filters
            </Button>
          ) : null
        }
      />
    );
  }

  const statusIds = statuses.map((status) => status.id);
  const grouped = groupByStatus(tasks, statusIds);

  // Safeguard: a task pointing at a status not in the current list (e.g. a stale cache after a status
  // change) would otherwise disappear. Collect any such orphans into a trailing "Unsorted" column so
  // they stay visible and can be dragged onto a real column to fix their status.
  const knownIds = new Set(statusIds);
  const orphans = tasks.filter((task) => !knownIds.has(task.statusId));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveTask(null)}
    >
      {/* Mobile: stacked columns (no horizontal scroll as the primary interaction). Desktop: a flex row
          of N data-driven columns that scrolls horizontally when there are many statuses. */}
      <div className="flex flex-col gap-3 md:flex-row md:overflow-x-auto md:pb-2">
        {statuses.map((status) => (
          <BoardColumn
            key={status.id}
            status={status}
            tasks={grouped[status.id] ?? []}
            collapsed={collapsed.has(status.id)}
            onToggle={() => toggleColumn(status.id)}
          />
        ))}

        {orphans.length > 0 ? (
          <section
            aria-labelledby="board-column-unsorted"
            className="bg-muted/35 flex min-h-[18rem] w-full flex-col rounded-lg border md:max-w-[22rem] md:min-w-[16rem] md:flex-1"
          >
            <h2
              id="board-column-unsorted"
              className="flex min-h-11 items-center gap-2 rounded-t-lg border-b px-4 py-3 text-sm font-medium"
            >
              <span className="min-w-0 flex-1 truncate">Unsorted</span>
              <span className="bg-background text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-xs">
                {orphans.length}
              </span>
            </h2>
            <div className="flex flex-1 flex-col gap-3 p-3">
              {orphans.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <DragOverlay>{activeTask ? <TaskCardOverlay task={activeTask} /> : null}</DragOverlay>
    </DndContext>
  );
}
