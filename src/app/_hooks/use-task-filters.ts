'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { z } from 'zod';
import { PriorityEnum, TASK_SORT_FIELDS } from '@/core/tasks/schema';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/core/shared/pagination';
import type { TaskListFilters } from '@/app/_lib/query-keys';

export type TaskView = 'table' | 'board';

// Per-field parse with `.catch(...)` so garbage in one URL param falls back to that field's default
// instead of nuking the whole filter set. Defaults mirror the server's `listTasksQuerySchema` — the
// URL is the single source of truth for filter state.
const filtersParseSchema = z.object({
  statusId: z.uuid().optional().catch(undefined),
  priority: PriorityEnum.optional().catch(undefined),
  assigneeId: z.uuid().optional().catch(undefined),
  q: z.string().trim().min(1).max(200).optional().catch(undefined),
  sort: z.enum(TASK_SORT_FIELDS).catch('createdAt'),
  dir: z.enum(['asc', 'desc']).catch('desc'),
  page: z.coerce.number().int().min(1).catch(1),
  size: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).catch(DEFAULT_PAGE_SIZE),
});

const DEFAULTS: TaskListFilters = {
  sort: 'createdAt',
  dir: 'desc',
  page: 1,
  size: DEFAULT_PAGE_SIZE,
};

function parseView(raw: string | null): TaskView {
  return raw === 'board' ? 'board' : 'table';
}

// Only non-default / non-empty params land in the URL — keeps shared links tidy. Raw filters
// (including `statusId`) are always preserved regardless of view, so toggling back to Table restores
// them.
function serialize(filters: TaskListFilters, view: TaskView): string {
  const params = new URLSearchParams();
  if (filters.statusId) params.set('statusId', filters.statusId);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.assigneeId) params.set('assigneeId', filters.assigneeId);
  if (filters.q) params.set('q', filters.q);
  if (filters.sort !== DEFAULTS.sort) params.set('sort', filters.sort);
  if (filters.dir !== DEFAULTS.dir) params.set('dir', filters.dir);
  if (filters.page !== 1) params.set('page', String(filters.page));
  if (filters.size !== DEFAULT_PAGE_SIZE) params.set('size', String(filters.size));
  if (view === 'board') params.set('view', 'board');
  return params.toString();
}

// The board's columns *are* the status axis, so its effective query drops `statusId`, forces page 1
// and fetches up to MAX_PAGE_SIZE, then the view groups client-side over the dynamic status list.
// Known limit: a board with more than MAX_PAGE_SIZE matching tasks shows only the first page;
// server-side per-column pagination is the follow-up.
function toEffective(filters: TaskListFilters, view: TaskView): TaskListFilters {
  if (view !== 'board') return filters;
  const next = { ...filters, page: 1, size: MAX_PAGE_SIZE };
  delete next.statusId;
  return next;
}

export type UseTaskFilters = {
  filters: TaskListFilters;
  effectiveFilters: TaskListFilters;
  view: TaskView;
  set: (patch: Partial<TaskListFilters>) => void;
  setView: (view: TaskView) => void;
  clear: () => void;
  hasActiveFilters: boolean;
};

export function useTaskFilters(): UseTaskFilters {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const view = parseView(searchParams.get('view'));

  const filters = useMemo<TaskListFilters>(() => {
    const raw = Object.fromEntries(searchParams.entries());
    return filtersParseSchema.parse(raw);
  }, [searchParams]);

  const effectiveFilters = useMemo(() => toEffective(filters, view), [filters, view]);

  const hasActiveFilters = Boolean(
    filters.statusId || filters.priority || filters.assigneeId || filters.q,
  );

  const push = useCallback(
    (next: TaskListFilters, nextView: TaskView) => {
      const qs = serialize(next, nextView);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const set = useCallback(
    (patch: Partial<TaskListFilters>) => {
      // Any change other than paging resets to page 1 (a new filter/sort invalidates the old page).
      const touchesFilters = Object.keys(patch).some((k) => k !== 'page');
      const nextPage = 'page' in patch ? (patch.page ?? 1) : touchesFilters ? 1 : filters.page;
      push({ ...filters, ...patch, page: nextPage }, view);
    },
    [filters, view, push],
  );

  const setView = useCallback((nextView: TaskView) => push(filters, nextView), [filters, push]);

  const clear = useCallback(() => push({ ...DEFAULTS }, view), [view, push]);

  return { filters, effectiveFilters, view, set, setView, clear, hasActiveFilters };
}
