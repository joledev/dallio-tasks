'use client';

import { LayoutGrid, Table2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTaskFilters, type TaskView } from '@/app/_hooks/use-task-filters';

// Accessible tab semantics for free. Value is bound to `?view=`; the page renders the matching view.
export function ViewToggle() {
  const { view, setView } = useTaskFilters();

  return (
    <Tabs value={view} onValueChange={(value) => setView(value as TaskView)}>
      <TabsList>
        <TabsTrigger value="table">
          <Table2 className="size-4" />
          Table
        </TabsTrigger>
        <TabsTrigger value="board">
          <LayoutGrid className="size-4" />
          Board
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
