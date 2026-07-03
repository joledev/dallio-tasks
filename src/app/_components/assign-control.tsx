'use client';

import { useOptionalBoard } from '@/app/_components/board-context';
import { BoardAssignControl } from '@/app/_components/board-assign-control';
import { cn } from '@/lib/utils';

// The assignee control seam. On the guest board (under a BoardProvider) it renders the interactive
// participant picker (H1 re-enable); on the owner flat `/` surface it stays a NON-INTERACTIVE
// placeholder — the flat surface has no participant registry yet (that returns in L4a with owner-side
// participant management), and posting a User id into the participant-scoped assign endpoint would
// always 404. So no mutation fires from the owner variant, and no id is resolved against the user map.
export function AssignControl({
  taskId,
  assigneeParticipantId,
  className,
}: {
  taskId: string;
  assigneeParticipantId: string | null;
  className?: string;
}) {
  const board = useOptionalBoard();

  if (board) {
    return (
      <BoardAssignControl
        taskId={taskId}
        assigneeParticipantId={assigneeParticipantId}
        className={className}
      />
    );
  }

  return (
    <div
      title="Assignment moves to board participants (coming with the board view)"
      aria-label="Assignment moves to board participants (coming with the board view)"
      className={cn(
        'border-input bg-muted text-muted-foreground flex h-9 w-[160px] cursor-not-allowed items-center rounded-md border px-3 text-sm',
        className,
      )}
    >
      {assigneeParticipantId ? 'Assigned' : 'Unassigned'}
    </div>
  );
}
