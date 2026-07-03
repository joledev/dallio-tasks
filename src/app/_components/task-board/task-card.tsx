'use client';

import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { GripVertical, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AssignControl } from '@/app/_components/assign-control';
import { StatusBadge, PriorityBadge } from '@/app/_components/badges';
import { DeleteTaskDialog } from '@/app/_components/delete-task-dialog';
import { PrioritySelect } from '@/app/_components/priority-select';
import { StatusSelect } from '@/app/_components/status-select';
import { TaskDialog } from '@/app/_components/task-dialog';
import type { TaskDTO } from '@/app/_lib/types';
import { cn } from '@/lib/utils';

export function TaskCard({ task }: { task: TaskDTO }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Drag source. The DnD status change is an *enhancement* layered over the inline StatusSelect below
  // (the accessible keyboard/touch fallback that always stays present). `data.statusId` lets the board's
  // onDragEnd short-circuit a same-column drop. The drag lives on a dedicated grip handle so pointer/
  // keyboard drags never fight the card's buttons/selects. On drag the source dims; a DragOverlay
  // (rendered by the board) provides the moving visual, so no transform is applied here.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { statusId: task.statusId },
  });

  return (
    <article
      ref={setNodeRef}
      className={cn(
        'bg-card text-card-foreground rounded-lg border p-4 shadow-xs',
        isDragging && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mt-0.5 -ml-1 cursor-grab touch-none rounded-sm focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing"
          aria-label={`Drag ${task.title} to another column`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="line-clamp-2 text-sm font-medium break-words">{task.title}</h3>
          {task.description ? (
            <p className="text-muted-foreground line-clamp-3 text-sm break-words">
              {task.description}
            </p>
          ) : null}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${task.title}`}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <StatusBadge status={task.status} />
        <PriorityBadge priority={task.priority} />
      </div>

      <div className="mt-4 grid gap-2">
        <StatusSelect taskId={task.id} statusId={task.statusId} className="w-full" />
        <PrioritySelect taskId={task.id} priority={task.priority} className="w-full" />
        <AssignControl assigneeParticipantId={task.assigneeParticipantId} className="w-full" />
      </div>

      <p className="text-muted-foreground mt-3 text-xs">
        {task.assigneeParticipantId ? 'Assigned' : 'Unassigned'}
      </p>

      <TaskDialog mode="edit" task={task} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteTaskDialog
        taskId={task.id}
        taskTitle={task.title}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </article>
  );
}

// Static, non-interactive clone rendered inside the board's <DragOverlay> while a card is dragged.
// It mirrors the card's look (title, snippet, badges, assignee) without the draggable/select wiring,
// so there are no duplicate registered draggables or focusable controls floating with the cursor.
export function TaskCardOverlay({ task }: { task: TaskDTO }) {
  return (
    <article className="bg-card text-card-foreground w-72 max-w-full rotate-1 cursor-grabbing rounded-lg border p-4 shadow-lg">
      <div className="flex items-start gap-2">
        <GripVertical className="text-muted-foreground mt-0.5 -ml-1 size-4" />
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="line-clamp-2 text-sm font-medium break-words">{task.title}</h3>
          {task.description ? (
            <p className="text-muted-foreground line-clamp-3 text-sm break-words">
              {task.description}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <StatusBadge status={task.status} />
        <PriorityBadge priority={task.priority} />
      </div>

      <p className="text-muted-foreground mt-3 text-xs">
        {task.assigneeParticipantId ? 'Assigned' : 'Unassigned'}
      </p>
    </article>
  );
}
