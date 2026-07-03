'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { boardKeys } from '@/app/_lib/query-keys';
import { boardActivityKeys, boardPresenceKeys, boardParticipantKeys } from '@/app/_lib/query-keys';
import { applyBoardEventToCache, type TaskCacheEvent } from '@/app/_lib/board-cache';
import type { BoardEvent } from '@/core/realtime/events';
import type { ActivityDTO } from '@/app/_lib/types';

const TASK_EVENTS = ['task.created', 'task.updated', 'task.moved', 'task.deleted'] as const;
const ACTIVITY_LIMIT = 30;

export function useBoardStream(token: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const source = new EventSource(`/api/b/${encodeURIComponent(token)}/events`);

    const refresh = () => {
      source.close();
      void queryClient.invalidateQueries({ queryKey: boardKeys(token) });
      setNonce((n) => n + 1);
    };

    source.addEventListener('refresh', refresh);

    const onTaskEvent = (message: MessageEvent<string>) => {
      try {
        applyBoardEventToCache(queryClient, token, JSON.parse(message.data) as TaskCacheEvent);
      } catch {
        void queryClient.invalidateQueries({ queryKey: boardKeys(token) });
      }
    };

    for (const event of TASK_EVENTS) source.addEventListener(event, onTaskEvent);

    const onPresenceEvent = () => {
      void queryClient.invalidateQueries({ queryKey: boardPresenceKeys(token).all });
    };

    // A fresh joiner isn't in the participants cache yet (staleTime), so the activity feed would render
    // them as "Someone" for minutes — also refresh participants so names resolve immediately.
    const onJoined = () => {
      onPresenceEvent();
      void queryClient.invalidateQueries({ queryKey: boardParticipantKeys(token).all });
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
      source.removeEventListener('participant.joined', onJoined);
      source.removeEventListener('participant.left', onPresenceEvent);
      source.removeEventListener('activity.appended', onActivityEvent);
      source.close();
    };
  }, [enabled, nonce, queryClient, token]);
}
