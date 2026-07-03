'use client';

import { Users } from 'lucide-react';
import { useBoard } from '@/app/_components/board-context';
import { useBoardPresence } from '@/app/_hooks/use-board-data';
import type { GuestParticipantDTO, StatusColor } from '@/app/_lib/types';
import { cn } from '@/lib/utils';

const AVATAR_CLASS: Record<StatusColor, string> = {
  zinc: 'bg-zinc-200 text-zinc-900 ring-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:ring-zinc-600',
  blue: 'bg-blue-100 text-blue-900 ring-blue-200 dark:bg-blue-950 dark:text-blue-100 dark:ring-blue-900',
  green:
    'bg-green-100 text-green-900 ring-green-200 dark:bg-green-950 dark:text-green-100 dark:ring-green-900',
  amber:
    'bg-amber-100 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-900',
  red: 'bg-red-100 text-red-900 ring-red-200 dark:bg-red-950 dark:text-red-100 dark:ring-red-900',
  violet:
    'bg-violet-100 text-violet-900 ring-violet-200 dark:bg-violet-950 dark:text-violet-100 dark:ring-violet-900',
  rose: 'bg-rose-100 text-rose-900 ring-rose-200 dark:bg-rose-950 dark:text-rose-100 dark:ring-rose-900',
};

const FALLBACK_COLORS: StatusColor[] = ['blue', 'green', 'amber', 'violet', 'rose', 'zinc'];

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function colorFor(participant: GuestParticipantDTO): StatusColor {
  if (participant.color) return participant.color as StatusColor;
  let hash = 0;
  for (const ch of participant.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

export function PresenceStrip() {
  const board = useBoard();
  const { participants, onlineCount } = useBoardPresence(board.token);

  return (
    <section aria-label="Online participants" className="flex min-w-0 items-center gap-2">
      <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <Users className="size-4" aria-hidden />
        <span>{onlineCount} online</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {participants.map((participant) => (
          <span
            key={participant.id}
            className="border-border bg-background inline-flex max-w-[180px] items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
            title={participant.displayName}
          >
            <span
              aria-hidden
              className={cn(
                'inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-1',
                AVATAR_CLASS[colorFor(participant)],
              )}
            >
              {initials(participant.displayName) || '?'}
            </span>
            <span className="truncate">{participant.displayName}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
