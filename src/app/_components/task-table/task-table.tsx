'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TASK_SORT_FIELDS } from '@/core/tasks/schema';
import { SORT_LABEL } from '@/app/_lib/labels';
import { useTaskFilters } from '@/app/_hooks/use-task-filters';
import { useTasks } from '@/app/_hooks/use-tasks';
import { StatusSelect } from '@/app/_components/status-select';
import { PrioritySelect } from '@/app/_components/priority-select';
import { AssignControl } from '@/app/_components/assign-control';
import { TaskDialog } from '@/app/_components/task-dialog';
import { LoadingState, EmptyState, ErrorState } from '@/app/_components/states';
import { formatDate } from '@/app/_lib/format';
import type { TaskDTO } from '@/app/_lib/types';
import { PaginationControls } from './pagination-controls';
import { TaskCardList } from './task-card-list';
import { TaskRowActions } from './task-row-actions';

type SortField = (typeof TASK_SORT_FIELDS)[number];

// One sortable header cell. Clicking the active field flips the direction; clicking a new field
// switches to it (ascending). The allowlist is the schema's `TASK_SORT_FIELDS`.
function SortableHeader({
  field,
  activeSort,
  activeDir,
  onSort,
  className,
}: {
  field: SortField;
  activeSort: SortField;
  activeDir: 'asc' | 'desc';
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const isActive = activeSort === field;
  return (
    <TableHead
      className={className}
      aria-sort={isActive ? (activeDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <Button
        variant="ghost"
        size="sm"
        className="data-[active=true]:text-foreground -ml-2 h-8"
        data-active={isActive}
        aria-label={`Sort by ${SORT_LABEL[field]}`}
        onClick={() => onSort(field)}
      >
        {SORT_LABEL[field]}
        {isActive ? (
          activeDir === 'asc' ? (
            <ArrowUp className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          )
        ) : (
          <ChevronsUpDown className="text-muted-foreground size-3.5" />
        )}
      </Button>
    </TableHead>
  );
}

export function TaskTable() {
  const { filters, effectiveFilters, set, clear, hasActiveFilters } = useTaskFilters();
  const { data, isLoading, isError, error, refetch, isPlaceholderData } =
    useTasks(effectiveFilters);
  const [createOpen, setCreateOpen] = useState(false);

  const handleSort = (field: SortField) => {
    if (filters.sort === field) {
      set({ dir: filters.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      set({ sort: field, dir: 'asc' });
    }
  };

  // Initial load (no cached page to keep on screen).
  if (isLoading && !data) return <LoadingState rows={8} />;

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const items = data?.items ?? [];
  const page = data?.page ?? filters.page;
  const size = data?.size ?? filters.size;
  const total = data?.total ?? 0;

  if (items.length === 0) {
    // Out-of-range page: the server returns items:[] (not an error). Offer a way back.
    if (total > 0 && page > 1) {
      return (
        <EmptyState
          title="Nothing on this page"
          description="This page is past the end of the list."
          action={
            <Button variant="outline" size="sm" onClick={() => set({ page: 1 })}>
              Back to first page
            </Button>
          }
        />
      );
    }
    // No match vs. no data at all.
    if (hasActiveFilters) {
      return (
        <EmptyState
          title="No tasks match your filters"
          description="Try adjusting or clearing the filters."
          action={
            <Button variant="outline" size="sm" onClick={clear}>
              Clear filters
            </Button>
          }
        />
      );
    }
    return (
      <>
        <EmptyState
          title="No tasks yet"
          description="Create your first task to get started."
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              New task
            </Button>
          }
        />
        <TaskDialog mode="create" open={createOpen} onOpenChange={setCreateOpen} />
      </>
    );
  }

  return (
    <div className="space-y-2">
      {/* Dim + block pointer during a page/filter change so stale rows read as pending (keepPreviousData). */}
      <div
        className={cn('transition-opacity', isPlaceholderData && 'pointer-events-none opacity-60')}
      >
        {/* Mobile: stacked cards (no horizontal scroll). md+: the sortable table. Both stay in the
            DOM via a CSS `display` switch, so only the visible one is in the a11y/tab tree. */}
        <TaskCardList items={items} className="md:hidden" />

        <div className="hidden md:block">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <SortableHeader
                  field="title"
                  activeSort={filters.sort}
                  activeDir={filters.dir}
                  onSort={handleSort}
                />
                <SortableHeader
                  field="status"
                  activeSort={filters.sort}
                  activeDir={filters.dir}
                  onSort={handleSort}
                />
                <SortableHeader
                  field="priority"
                  activeSort={filters.sort}
                  activeDir={filters.dir}
                  onSort={handleSort}
                />
                <TableHead>Assignee</TableHead>
                <SortableHeader
                  field="createdAt"
                  activeSort={filters.sort}
                  activeDir={filters.dir}
                  onSort={handleSort}
                />
                <TableHead className="w-10 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((task: TaskDTO) => (
                <TableRow key={task.id}>
                  <TableCell className="max-w-[280px] font-medium">
                    <span className="block truncate" title={task.title}>
                      {task.title}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusSelect taskId={task.id} statusId={task.statusId} />
                  </TableCell>
                  <TableCell>
                    <PrioritySelect taskId={task.id} priority={task.priority} />
                  </TableCell>
                  <TableCell>
                    <AssignControl taskId={task.id} assigneeId={task.assigneeId} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(task.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <TaskRowActions task={task} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <PaginationControls
        page={page}
        size={size}
        total={total}
        disabled={isPlaceholderData}
        onPageChange={(next) => set({ page: next })}
        onSizeChange={(next) => set({ size: next, page: 1 })}
      />
    </div>
  );
}
