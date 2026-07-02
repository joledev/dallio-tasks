'use client';

import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTaskMutations } from '@/app/_hooks/use-task-mutations';

// The `remove` mutation owns the error toast + list invalidate; here we add the success toast and
// close the dialog on settle.
export function DeleteTaskDialog({
  taskId,
  taskTitle,
  open,
  onOpenChange,
}: {
  taskId: string;
  taskTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { remove } = useTaskMutations();

  const onConfirm = async () => {
    try {
      await remove.mutateAsync({ id: taskId });
      toast.success('Task deleted.');
      onOpenChange(false);
    } catch {
      // Error toast already surfaced by the mutation; keep the dialog open.
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this task?</AlertDialogTitle>
          <AlertDialogDescription>
            {taskTitle ? `"${taskTitle}" ` : 'This task '}
            will be permanently removed. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void onConfirm();
            }}
            disabled={remove.isPending}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
