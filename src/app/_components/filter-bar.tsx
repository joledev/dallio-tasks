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
import {
  StatusEnum,
  PriorityEnum,
  TASK_SORT_FIELDS,
  type TaskStatus,
  type TaskPriority,
} from '@/core/tasks/schema';
import { STATUS_LABEL, PRIORITY_LABEL, SORT_LABEL } from '@/app/_lib/labels';
import { useTaskFilters } from '@/app/_hooks/use-task-filters';
import { useUsers } from '@/app/_hooks/use-users';
import { TaskDialog } from './task-dialog';

// Radix Select forbids an empty value, so "All" gets a sentinel that maps back to `undefined`.
const ALL = '__all__';

export function FilterBar() {
  const { filters, view, set, clear, hasActiveFilters } = useTaskFilters();
  const { users } = useUsers();
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
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1">
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
          value={filters.status ?? ALL}
          onValueChange={(v) => set({ status: v === ALL ? undefined : (v as TaskStatus) })}
        >
          <SelectTrigger className="w-[150px]" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {StatusEnum.options.map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <Select
        value={filters.priority ?? ALL}
        onValueChange={(v) => set({ priority: v === ALL ? undefined : (v as TaskPriority) })}
      >
        <SelectTrigger className="w-[150px]" aria-label="Filter by priority">
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

      {/* Assignee filter: the API filters by a concrete `assigneeId` (uuid) only — there is no
          "unassigned" filter param, so the options are All + each user. */}
      <Select
        value={filters.assigneeId ?? ALL}
        onValueChange={(v) => set({ assigneeId: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="w-[160px]" aria-label="Filter by assignee">
          <SelectValue placeholder="All assignees" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All assignees</SelectItem>
          {users.map((user) => (
            <SelectItem key={user.id} value={user.id}>
              {user.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.sort} onValueChange={(v) => set({ sort: v as typeof filters.sort })}>
        <SelectTrigger className="w-[140px]" aria-label="Sort by">
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
        aria-label={filters.dir === 'asc' ? 'Ascending' : 'Descending'}
        onClick={() => set({ dir: filters.dir === 'asc' ? 'desc' : 'asc' })}
      >
        {filters.dir === 'asc' ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
      </Button>

      {hasActiveFilters ? (
        <Button variant="ghost" size="sm" onClick={clear}>
          <X className="size-4" />
          Clear
        </Button>
      ) : null}

      <div className="ml-auto">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          New task
        </Button>
      </div>

      <TaskDialog mode="create" open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
