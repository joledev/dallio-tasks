'use client';

import { Suspense } from 'react';
import { FilterBar } from '@/app/_components/filter-bar';
import { ViewToggle } from '@/app/_components/view-toggle';
import { TaskTable } from '@/app/_components/task-table/task-table';
import { TaskBoard } from '@/app/_components/task-board/task-board';
import { LoadingState } from '@/app/_components/states';
import { useTaskFilters } from '@/app/_hooks/use-task-filters';

// Composition shell: FilterBar + ViewToggle + the active view. Each view owns its own `useTasks()`
// call keyed by its effective filters.
function Dashboard() {
  const { view } = useTaskFilters();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Dallio Tasks</h1>
        <ViewToggle />
      </header>

      <div className="space-y-4">
        <FilterBar />
        {view === 'board' ? <TaskBoard /> : <TaskTable />}
      </div>
    </div>
  );
}

// `useTaskFilters()` reads `useSearchParams()`, which Next.js requires to sit under a Suspense
// boundary (otherwise the whole route opts out of static rendering / the build errors).
export default function Home() {
  return (
    <main className="flex-1">
      <Suspense fallback={<LoadingState rows={8} className="mx-auto max-w-6xl px-4 py-8" />}>
        <Dashboard />
      </Suspense>
    </main>
  );
}
