'use client';

import { useBoard, useOptionalBoard } from '@/app/_components/board-context';
import { useBoardParticipants } from '@/app/_hooks/use-board-data';

// The one-line assignee summary under a card. On the board it resolves `assigneeParticipantId` against
// THIS board's participants map (never the user map) and shows the display name, or "Unassigned" when
// the id is null / no longer a participant. On the flat `/` surface (no participant registry yet) it
// degrades to the generic Assigned/Unassigned wording.
function BoardAssigneeText({ assigneeParticipantId }: { assigneeParticipantId: string | null }) {
  const board = useBoard();
  const { data: participants = [] } = useBoardParticipants(board.token);
  const match = assigneeParticipantId
    ? participants.find((p) => p.id === assigneeParticipantId)
    : undefined;
  return <>{match ? match.displayName : 'Unassigned'}</>;
}

export function AssigneeText({ assigneeParticipantId }: { assigneeParticipantId: string | null }) {
  const board = useOptionalBoard();
  if (board) return <BoardAssigneeText assigneeParticipantId={assigneeParticipantId} />;
  return <>{assigneeParticipantId ? 'Assigned' : 'Unassigned'}</>;
}
