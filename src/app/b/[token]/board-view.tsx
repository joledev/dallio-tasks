'use client';

import { FilterBar } from '@/app/_components/filter-bar';
import { ViewToggle } from '@/app/_components/view-toggle';
import { TaskTable } from '@/app/_components/task-table/task-table';
import { TaskBoard } from '@/app/_components/task-board/task-board';
import { ActivityFeed } from '@/app/_components/activity-feed';
import { PresenceStrip } from '@/app/_components/presence-strip';
import { useTaskFilters } from '@/app/_hooks/use-task-filters';

// The joined-guest board. This is the SAME composition as the flat `/` dashboard — FilterBar +
// ViewToggle + the active view — reused verbatim; only the data seam differs (the shared hooks read the
// token from BoardProvider). No parallel styling, no forked components. Mounted only once the server
// confirms the guest has joined, and keyed by token so a board switch is a clean remount (UI-H1).
export function BoardView({ boardName }: { boardName: string }) {
  const { view } = useTaskFilters();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{boardName}</h1>
        <ViewToggle />
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          <PresenceStrip />
          <FilterBar />
          {view === 'board' ? <TaskBoard /> : <TaskTable />}
        </div>
        <ActivityFeed />
      </div>
    </div>
  );
}
