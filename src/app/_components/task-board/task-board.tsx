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
import { StatusEnum } from '@/core/tasks/schema';
import { EmptyState, ErrorState, LoadingState } from '@/app/_components/states';
import { useTaskFilters } from '@/app/_hooks/use-task-filters';
import { useTaskMutations } from '@/app/_hooks/use-task-mutations';
import { useTasks } from '@/app/_hooks/use-tasks';
import type { TaskDTO, TaskStatus } from '@/app/_lib/types';
import { BoardColumn } from './board-column';
import { TaskCardOverlay } from './task-card';

function groupByStatus(tasks: TaskDTO[]): Record<TaskStatus, TaskDTO[]> {
  return {
    TODO: tasks.filter((task) => task.status === 'TODO'),
    IN_PROGRESS: tasks.filter((task) => task.status === 'IN_PROGRESS'),
    DONE: tasks.filter((task) => task.status === 'DONE'),
  };
}

export function TaskBoard() {
  const { effectiveFilters, clear, hasActiveFilters } = useTaskFilters();
  const { data, isLoading, isError, error, refetch } = useTasks(effectiveFilters);
  const { update } = useTaskMutations();
  const [activeTask, setActiveTask] = useState<TaskDTO | null>(null);

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
    const from = active.data.current?.status as TaskStatus | undefined;
    const to = (over.data.current?.status ?? over.id) as TaskStatus;
    if (!to || to === from) return;
    update.mutate({ id: String(active.id), patch: { status: to } });
  };

  if (isLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        {StatusEnum.options.map((status) => (
          <LoadingState key={status} rows={4} className="rounded-lg border p-3" />
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

  const grouped = groupByStatus(tasks);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveTask(null)}
    >
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-full gap-3 md:grid-cols-3">
          {StatusEnum.options.map((status) => (
            <BoardColumn key={status} status={status} tasks={grouped[status]} />
          ))}
        </div>
      </div>

      <DragOverlay>{activeTask ? <TaskCardOverlay task={activeTask} /> : null}</DragOverlay>
    </DndContext>
  );
}
