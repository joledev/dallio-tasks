'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { boardKeys } from '@/app/_lib/query-keys';
import { applyBoardEventToCache, type TaskCacheEvent } from '@/app/_lib/board-cache';

const TASK_EVENTS = ['task.created', 'task.updated', 'task.moved', 'task.deleted'] as const;

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

    return () => {
      source.removeEventListener('refresh', refresh);
      for (const event of TASK_EVENTS) source.removeEventListener(event, onTaskEvent);
      source.close();
    };
  }, [enabled, nonce, queryClient, token]);
}
