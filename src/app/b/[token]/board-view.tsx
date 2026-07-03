'use client';

import Link from 'next/link';
import { LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterBar } from '@/app/_components/filter-bar';
import { ViewToggle } from '@/app/_components/view-toggle';
import { TaskTable } from '@/app/_components/task-table/task-table';
import { TaskBoard } from '@/app/_components/task-board/task-board';
import { ActivityFeed } from '@/app/_components/activity-feed';
import { BoardModeToggle, ProposalsPanel } from '@/app/_components/proposals-panel';
import { PresenceStrip } from '@/app/_components/presence-strip';
import { BoardRequestMenu } from '@/app/_components/board-request-menu';
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
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" className="min-h-11">
            <Link href="/">
              <LayoutDashboard className="size-4" aria-hidden />
              All boards
            </Link>
          </Button>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{boardName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <BoardModeToggle />
          <ViewToggle />
          <BoardRequestMenu />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          <PresenceStrip />
          <FilterBar />
          {view === 'board' ? <TaskBoard /> : <TaskTable />}
        </div>
        <div className="space-y-4">
          <ProposalsPanel />
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}
