'use client';

import { Activity } from 'lucide-react';
import { useBoard } from '@/app/_components/board-context';
import { useBoardActivity, useBoardParticipants } from '@/app/_hooks/use-board-data';
import type { ActivityDTO, GuestParticipantDTO } from '@/app/_lib/types';

const ACTION_LABEL: Record<ActivityDTO['action'], string> = {
  'participant.joined': 'joined the board',
  'task.created': 'created a task',
  'task.updated': 'updated a task',
  'task.moved': 'moved a task',
  'task.deleted': 'deleted a task',
};

function actorName(activity: ActivityDTO, participants: GuestParticipantDTO[]): string {
  return (
    participants.find((participant) => participant.id === activity.participantId)?.displayName ??
    'Someone'
  );
}

function taskTitle(activity: ActivityDTO): string | null {
  const meta = activity.meta;
  if (!meta || typeof meta !== 'object' || !('title' in meta)) return null;
  const title = (meta as { title?: unknown }).title;
  return typeof title === 'string' && title.trim() ? title : null;
}

export function ActivityFeed() {
  const board = useBoard();
  const { activity } = useBoardActivity(board.token);
  const { data: participants = [] } = useBoardParticipants(board.token);
  const latest = activity.slice(-8).reverse();

  return (
    <aside aria-label="Activity feed" className="border-border rounded-md border">
      <div className="border-border flex items-center gap-2 border-b px-3 py-2 text-sm font-medium">
        <Activity className="size-4" aria-hidden />
        <span>Activity</span>
      </div>
      <ol className="max-h-64 overflow-y-auto px-3 py-2">
        {latest.length === 0 ? (
          <li className="text-muted-foreground py-4 text-sm">No activity yet</li>
        ) : (
          latest.map((item) => {
            const title = taskTitle(item);
            return (
              <li key={item.id} className="border-border/70 border-b py-2 last:border-b-0">
                <p className="text-sm">
                  <span className="font-medium">{actorName(item, participants)}</span>{' '}
                  {ACTION_LABEL[item.action]}
                </p>
                {title ? <p className="text-muted-foreground truncate text-xs">{title}</p> : null}
              </li>
            );
          })
        )}
      </ol>
    </aside>
  );
}
