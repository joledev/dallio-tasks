'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBoard } from '@/app/_components/board-context';
import { useBoardParticipants } from '@/app/_hooks/use-board-data';
import { useTaskFilters } from '@/app/_hooks/use-task-filters';

// Radix Select forbids an empty value, so "All" gets a sentinel that maps back to `undefined`.
const ALL = '__all__';

// The board-variant assignee filter (the flat `/` filter stays hidden). Options come from THIS board's
// participants; the selection sets `assigneeParticipantId` in the URL query the list is keyed on. Names
// carry the meaning (color is only reinforcement in the picker), so this is a plain name list.
export function BoardAssigneeFilter() {
  const board = useBoard();
  const { data: participants = [] } = useBoardParticipants(board.token);
  const { filters, set } = useTaskFilters();

  return (
    <Select
      value={filters.assigneeParticipantId ?? ALL}
      onValueChange={(v) => set({ assigneeParticipantId: v === ALL ? undefined : v })}
    >
      <SelectTrigger className="h-11! w-full md:h-9! md:w-[150px]" aria-label="Filter by assignee">
        <SelectValue placeholder="All assignees" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All assignees</SelectItem>
        {participants.map((participant) => (
          <SelectItem key={participant.id} value={participant.id}>
            {participant.displayName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
