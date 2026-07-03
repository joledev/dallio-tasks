'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PriorityEnum, TASK_SORT_FIELDS, type TaskPriority } from '@/core/tasks/schema';
import { PRIORITY_LABEL, SORT_LABEL } from '@/app/_lib/labels';
import { useTaskFilters } from '@/app/_hooks/use-task-filters';
import { useStatuses } from '@/app/_hooks/use-statuses';
import { useOptionalBoard } from '@/app/_components/board-context';
import { BoardAssigneeFilter } from '@/app/_components/board-assignee-filter';
import { TaskDialog } from './task-dialog';

// Radix Select forbids an empty value, so "All" gets a sentinel that maps back to `undefined`.
const ALL = '__all__';

export function FilterBar() {
  const { filters, view, set, clear, hasActiveFilters } = useTaskFilters();
  const { statuses } = useStatuses();
  const board = useOptionalBoard();
  const [createOpen, setCreateOpen] = useState(false);

  // `q` is debounced in local state before it hits the URL (~300ms) so we don't push a history entry
  // per keystroke. Local input stays the source while typing.
  const [qInput, setQInput] = useState(filters.q ?? '');

  // Sync local input when `q` is reset externally (e.g. Clear): the input owns the value while typing,
  // so an effect is the least-bad way to let an outside reset flow back into it.
  useEffect(() => {
    setQInput(filters.q ?? '');
  }, [filters.q]);

  useEffect(() => {
    const next = qInput.trim() === '' ? undefined : qInput.trim();
    if (next === filters.q) return;
    const timer = setTimeout(() => set({ q: next }), 300);
    return () => clearTimeout(timer);
  }, [qInput, filters.q, set]);

  const hideStatus = view === 'board';

  return (
    // Mobile: a 2-col grid — search + the primary/Clear actions span both columns, the compact
    // selects sit two-up, so nothing side-scrolls. md+: the original single wrapping flex row.
    <div className="grid grid-cols-2 items-center gap-2 md:flex md:flex-wrap">
      <div className="relative col-span-2 min-w-[200px] md:flex-1">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Search titles…"
          aria-label="Search tasks"
          className="pl-8"
        />
      </div>

      {!hideStatus ? (
        <Select
          value={filters.statusId ?? ALL}
          onValueChange={(v) => set({ statusId: v === ALL ? undefined : v })}
        >
          <SelectTrigger
            className="h-11! w-full md:h-9! md:w-[150px]"
            aria-label="Filter by status"
          >
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {statuses.map((status) => (
              <SelectItem key={status.id} value={status.id}>
                {status.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <Select
        value={filters.priority ?? ALL}
        onValueChange={(v) => set({ priority: v === ALL ? undefined : (v as TaskPriority) })}
      >
        <SelectTrigger
          className="h-11! w-full md:h-9! md:w-[150px]"
          aria-label="Filter by priority"
        >
          <SelectValue placeholder="All priorities" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All priorities</SelectItem>
          {PriorityEnum.options.map((value) => (
            <SelectItem key={value} value={value}>
              {PRIORITY_LABEL[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Assignee filter — board variant only. On the guest board it lists this board's participants
          and sets `assigneeParticipantId` in the URL query. The flat `/` surface has no participant
          registry yet (L4a), so it stays hidden there — a User-id filter would match zero tasks. */}
      {board ? <BoardAssigneeFilter /> : null}

      {/* Sort + direction share one cell so the icon toggle stays next to its select (the card list
          has no column headers — this is the sole sort affordance on mobile). Span both mobile columns
          so the select is wide enough to show the full label (e.g. "Created", not a clipped "Create"). */}
      <div className="col-span-2 flex items-center gap-2 md:col-span-1">
        <Select value={filters.sort} onValueChange={(v) => set({ sort: v as typeof filters.sort })}>
          <SelectTrigger className="h-11! w-full min-w-0 md:h-9! md:w-[140px]" aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TASK_SORT_FIELDS.map((value) => (
              <SelectItem key={value} value={value}>
                {SORT_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0 md:size-9"
          aria-label={filters.dir === 'asc' ? 'Ascending' : 'Descending'}
          onClick={() => set({ dir: filters.dir === 'asc' ? 'desc' : 'asc' })}
        >
          {filters.dir === 'asc' ? (
            <ArrowUp className="size-4" />
          ) : (
            <ArrowDown className="size-4" />
          )}
        </Button>
      </div>

      {hasActiveFilters ? (
        <Button
          variant="ghost"
          size="sm"
          className="col-span-2 h-11 justify-self-start md:h-8"
          onClick={clear}
        >
          <X className="size-4" />
          Clear
        </Button>
      ) : null}

      <Button
        className="col-span-2 h-11 w-full md:ml-auto md:h-9 md:w-auto"
        onClick={() => setCreateOpen(true)}
      >
        <Plus className="size-4" />
        New task
      </Button>

      <TaskDialog mode="create" open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
