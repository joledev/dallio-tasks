'use client';

import { useState } from 'react';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TaskDialog } from '@/app/_components/task-dialog';
import { DeleteTaskDialog } from '@/app/_components/delete-task-dialog';
import type { TaskDTO } from '@/app/_lib/types';

// Edit opens the shared TaskDialog in edit mode; Delete opens the shared AlertDialog confirm. Both
// dialogs are rendered here and toggled via local UI state.
export function TaskRowActions({ task }: { task: TaskDTO }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Task actions">
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

      <TaskDialog mode="edit" task={task} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteTaskDialog
        taskId={task.id}
        taskTitle={task.title}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
