'use client';

import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { BoardEvent } from '@/core/realtime/events';
import type { Paginated, TaskDTO } from '@/app/_lib/types';
import type { ProposalDTO } from '@/app/_lib/types';
import { boardProposalKeys, boardTaskKeys } from '@/app/_lib/query-keys';

export type ListSnapshot = Array<[QueryKey, Paginated<TaskDTO> | undefined]>;
export type OptimisticContext = { previous: ListSnapshot };

type TaskBoardEvent = Extract<
  BoardEvent,
  { type: 'task.created' | 'task.updated' | 'task.moved' }
> & {
  data: TaskDTO;
};

type DeletedBoardEvent = Extract<BoardEvent, { type: 'task.deleted' }>;
export type TaskCacheEvent = TaskBoardEvent | DeletedBoardEvent;
export type ProposalCacheEvent = Extract<
  BoardEvent,
  { type: 'proposal.created' | 'proposal.updated' | 'proposal.applied' }
> & {
  data: ProposalDTO;
};

export function patchCachedTask(
  queryClient: QueryClient,
  listKey: QueryKey,
  id: string,
  partial: Partial<TaskDTO>,
) {
  queryClient.setQueriesData<Paginated<TaskDTO>>({ queryKey: listKey }, (old) => {
    if (!old) return old;
    return { ...old, items: old.items.map((t) => (t.id === id ? { ...t, ...partial } : t)) };
  });
}

export function replaceCachedTask(queryClient: QueryClient, listKey: QueryKey, task: TaskDTO) {
  queryClient.setQueriesData<Paginated<TaskDTO>>({ queryKey: listKey }, (old) => {
    if (!old) return old;
    return { ...old, items: old.items.map((t) => (t.id === task.id ? task : t)) };
  });
}

export function removeCachedTask(queryClient: QueryClient, listKey: QueryKey, id: string) {
  queryClient.setQueriesData<Paginated<TaskDTO>>({ queryKey: listKey }, (old) => {
    if (!old) return old;
    const items = old.items.filter((t) => t.id !== id);
    return {
      ...old,
      items,
      total: Math.max(0, old.total - (items.length === old.items.length ? 0 : 1)),
    };
  });
}

export async function beginOptimisticTaskPatch(
  queryClient: QueryClient,
  listKey: QueryKey,
  id: string,
  partial: Partial<TaskDTO>,
): Promise<OptimisticContext> {
  await queryClient.cancelQueries({ queryKey: listKey });
  const previous = queryClient.getQueriesData<Paginated<TaskDTO>>({ queryKey: listKey });
  patchCachedTask(queryClient, listKey, id, partial);
  return { previous };
}

export function rollbackTaskPatch(
  queryClient: QueryClient,
  context: OptimisticContext | undefined,
) {
  for (const [key, data] of context?.previous ?? []) queryClient.setQueryData(key, data);
}

export function invalidateTaskLists(queryClient: QueryClient, listKey: QueryKey) {
  return queryClient.invalidateQueries({ queryKey: listKey });
}

export function applyBoardEventToCache(
  queryClient: QueryClient,
  token: string,
  event: TaskCacheEvent,
) {
  const listKey = boardTaskKeys(token).all;
  if (event.type === 'task.created') {
    void invalidateTaskLists(queryClient, listKey);
  } else if (event.type === 'task.updated' || event.type === 'task.moved') {
    replaceCachedTask(queryClient, listKey, event.data);
  } else {
    removeCachedTask(queryClient, listKey, event.data.id);
  }
}

export function applyProposalEventToCache(
  queryClient: QueryClient,
  token: string,
  event: ProposalCacheEvent,
) {
  queryClient.setQueryData<ProposalDTO[]>(boardProposalKeys(token).all, (old = []) => {
    if (event.type === 'proposal.created') return [event.data, ...old];
    const next = old.map((proposal) => (proposal.id === event.data.id ? event.data : proposal));
    return next.some((proposal) => proposal.id === event.data.id) ? next : [event.data, ...old];
  });
}
