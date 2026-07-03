'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBoard } from '@/app/_components/board-context';
import { useBoardParticipants, useBoardTaskMutations } from '@/app/_hooks/use-board-data';
import type { GuestParticipantDTO } from '@/app/_lib/types';
import { cn } from '@/lib/utils';

// Radix Select forbids an empty value, so "Unassigned" gets a sentinel that maps back to `null`.
const UNASSIGNED = '__unassigned__';

// A small, fixed set of zinc-compatible dot colors. The swatch is ALWAYS paired with the display name
// (never color-only — WCAG 2.2), so the color is decorative reinforcement, not the sole signal. Colors
// are assigned deterministically from the participant id so a given person keeps the same dot.
const DOT_CLASSES = [
  'bg-blue-500',
  'bg-green-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-cyan-500',
] as const;

function dotClassFor(participant: GuestParticipantDTO): string {
  let hash = 0;
  for (const ch of participant.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return DOT_CLASSES[hash % DOT_CLASSES.length];
}

function ParticipantDot({ participant }: { participant: GuestParticipantDTO }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2.5 shrink-0 rounded-full', dotClassFor(participant))}
    />
  );
}

// The board participant picker (H1 re-enable). Options come from THIS board's participants only, so it
// can never assign across boards; the server re-checks same-board on the assign call. Posting an id sets
// `assigneeParticipantId`; "Unassigned" posts null. The trigger mirrors the selected option's content
// (dot + name), so it doubles as the assignee display. An id that resolves to no current participant
// falls back to the "Unassigned" placeholder.
export function BoardAssignControl({
  taskId,
  assigneeParticipantId,
  className,
}: {
  taskId: string;
  assigneeParticipantId: string | null;
  className?: string;
}) {
  const board = useBoard();
  const { data: participants = [], isLoading } = useBoardParticipants(board.token);
  const { assign } = useBoardTaskMutations(board.token);

  const known = assigneeParticipantId
    ? participants.some((p) => p.id === assigneeParticipantId)
    : false;
  const value = known ? (assigneeParticipantId as string) : UNASSIGNED;

  return (
    <Select
      value={value}
      disabled={assign.isPending || isLoading}
      onValueChange={(v) =>
        assign.mutate({ id: taskId, assigneeParticipantId: v === UNASSIGNED ? null : v })
      }
    >
      <SelectTrigger size="sm" className={cn('w-[160px]', className)} aria-label="Assignee">
        <SelectValue placeholder="Unassigned" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
        {participants.map((participant) => (
          <SelectItem key={participant.id} value={participant.id}>
            <span className="flex items-center gap-2">
              <ParticipantDot participant={participant} />
              <span className="truncate">{participant.displayName}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
