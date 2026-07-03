'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { boardKeys } from '@/app/_lib/query-keys';
import {
  boardActivityKeys,
  boardPresenceKeys,
  boardParticipantKeys,
  boardStatusKeys,
  boardTaskKeys,
} from '@/app/_lib/query-keys';
import {
  applyBoardEventToCache,
  applyProposalEventToCache,
  type ProposalCacheEvent,
  type TaskCacheEvent,
} from '@/app/_lib/board-cache';
import type { BoardEvent } from '@/core/realtime/events';
import type { ActivityDTO, GuestParticipantDTO } from '@/app/_lib/types';

const TASK_EVENTS = ['task.created', 'task.updated', 'task.moved', 'task.deleted'] as const;
const STATUS_EVENTS = ['status.created', 'status.deleted'] as const;
const PROPOSAL_EVENTS = ['proposal.created', 'proposal.updated', 'proposal.applied'] as const;
const ACTIVITY_LIMIT = 30;

// Resolve the actor's display name for a "who did what" toast. Prefer the participants cache (keyed by
// the event's actorId); fall back to the payload a fresh joiner carries (they aren't in the cache yet
// due to staleTime); else "Someone".
function actorDisplayName(queryClient: QueryClient, token: string, event: BoardEvent): string {
  const participants = queryClient.getQueryData<GuestParticipantDTO[]>(
    boardParticipantKeys(token).all,
  );
  const named = event.actorId
    ? participants?.find((participant) => participant.id === event.actorId)?.displayName
    : undefined;
  if (named) return named;
  if (event.type === 'participant.joined') return event.data.participant.displayName;
  return 'Someone';
}

// One short, plain-language line per typed change event. Derived from the event's own `data` (task
// title, status name) so it needs no extra fetch. Returns null for events we don't surface as a toast.
function changeToastMessage(event: BoardEvent, name: string): string | null {
  switch (event.type) {
    case 'task.created':
      return `${name} added "${event.data.title}"`;
    case 'task.updated':
      return `${name} updated "${event.data.title}"`;
    case 'task.moved':
      return `${name} moved "${event.data.title}"`;
    case 'task.deleted':
      return `${name} deleted a task`;
    case 'status.created':
      return `${name} added column "${event.data.name}"`;
    case 'status.deleted':
      return `${name} removed a column`;
    case 'participant.joined':
      return `${name} joined`;
    default:
      return null;
  }
}

export function useBoardStream(
  token: string,
  enabled: boolean,
  present = false,
  selfParticipantId: string | null = null,
) {
  const queryClient = useQueryClient();
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const qs = present ? '?present=1' : '';
    const source = new EventSource(`/api/b/${encodeURIComponent(token)}/events${qs}`);

    // Toast WHO did WHAT — but never for the current user's own actions (actorId === self), and never
    // for system/null-actor events. Names resolve from the payload/participants cache; the text comes
    // straight from the event data so no refetch is needed.
    const notifyChange = (event: BoardEvent) => {
      if (!event.actorId || event.actorId === selfParticipantId) return;
      const message = changeToastMessage(event, actorDisplayName(queryClient, token, event));
      if (message) toast(message);
    };

    const refresh = () => {
      source.close();
      void queryClient.invalidateQueries({ queryKey: boardKeys(token) });
      setNonce((n) => n + 1);
    };

    source.addEventListener('refresh', refresh);

    const onTaskEvent = (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as BoardEvent;
        applyBoardEventToCache(queryClient, token, event as TaskCacheEvent);
        notifyChange(event);
      } catch {
        void queryClient.invalidateQueries({ queryKey: boardKeys(token) });
      }
    };

    for (const event of TASK_EVENTS) source.addEventListener(event, onTaskEvent);

    // A new/removed column must show for everyone: invalidate the board's statuses (columns) and its
    // tasks (the board view groups tasks by status, so the column set changes what it renders).
    const onStatusEvent = (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as BoardEvent;
        void queryClient.invalidateQueries({ queryKey: boardStatusKeys(token).all });
        void queryClient.invalidateQueries({ queryKey: boardTaskKeys(token).all });
        notifyChange(event);
      } catch {
        void queryClient.invalidateQueries({ queryKey: boardKeys(token) });
      }
    };

    for (const event of STATUS_EVENTS) source.addEventListener(event, onStatusEvent);

    const onProposalEvent = (message: MessageEvent<string>) => {
      try {
        applyProposalEventToCache(
          queryClient,
          token,
          JSON.parse(message.data) as ProposalCacheEvent,
        );
      } catch {
        void queryClient.invalidateQueries({ queryKey: boardKeys(token) });
      }
    };

    for (const event of PROPOSAL_EVENTS) source.addEventListener(event, onProposalEvent);

    const onPresenceEvent = () => {
      void queryClient.invalidateQueries({ queryKey: boardPresenceKeys(token).all });
    };

    // A fresh joiner isn't in the participants cache yet (staleTime), so the activity feed would render
    // them as "Someone" for minutes — also refresh participants so names resolve immediately.
    const onJoined = (message: MessageEvent<string>) => {
      onPresenceEvent();
      void queryClient.invalidateQueries({ queryKey: boardParticipantKeys(token).all });
      try {
        notifyChange(JSON.parse(message.data) as BoardEvent);
      } catch {
        // presence already refreshed; a toast is best-effort only.
      }
    };

    const onActivityEvent = (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as BoardEvent;
        queryClient.setQueryData<ActivityDTO[]>(boardActivityKeys(token).all, (old = []) =>
          [...old, event.data as ActivityDTO].slice(-ACTIVITY_LIMIT),
        );
      } catch {
        void queryClient.invalidateQueries({ queryKey: boardActivityKeys(token).all });
      }
    };

    source.addEventListener('participant.joined', onJoined);
    source.addEventListener('participant.left', onPresenceEvent);
    source.addEventListener('activity.appended', onActivityEvent);

    return () => {
      source.removeEventListener('refresh', refresh);
      for (const event of TASK_EVENTS) source.removeEventListener(event, onTaskEvent);
      for (const event of STATUS_EVENTS) source.removeEventListener(event, onStatusEvent);
      for (const event of PROPOSAL_EVENTS) source.removeEventListener(event, onProposalEvent);
      source.removeEventListener('participant.joined', onJoined);
      source.removeEventListener('participant.left', onPresenceEvent);
      source.removeEventListener('activity.appended', onActivityEvent);
      source.close();
    };
  }, [enabled, nonce, present, queryClient, token, selfParticipantId]);
}
