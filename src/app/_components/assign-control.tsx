'use client';

import { cn } from '@/lib/utils';

// H1 repointed assignment from Users → board Participants. The participant picker ships with the board
// view (next pass), so the owner UI renders a NON-INTERACTIVE placeholder instead of a control that
// would post a User id into the participant-scoped assign endpoint (which would always 404). No
// mutation is fired from here, and no participant id is resolved against the user map.
export function AssignControl({
  assigneeParticipantId,
  className,
}: {
  assigneeParticipantId: string | null;
  className?: string;
}) {
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
