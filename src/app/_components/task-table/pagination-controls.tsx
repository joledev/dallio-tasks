'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/core/shared/pagination';

// Page-size options mirror the server's contract: default 20, capped at MAX_PAGE_SIZE (100).
const PAGE_SIZES = [DEFAULT_PAGE_SIZE, 50, MAX_PAGE_SIZE] as const;

// "x–y of total", prev/next disabled at the ends, page-size select. All state lives in the URL —
// the table wires these callbacks to `useTaskFilters().set()`.
export function PaginationControls({
  page,
  size,
  total,
  onPageChange,
  onSizeChange,
  disabled,
}: {
  page: number;
  size: number;
  total: number;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
  disabled?: boolean;
}) {
  const start = total === 0 ? 0 : (page - 1) * size + 1;
  const end = Math.min(page * size, total);
  const isFirst = page <= 1;
  const isLast = page * size >= total;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {total === 0 ? 'No tasks' : `Showing ${start}–${end} of ${total}`}
      </p>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground hidden text-sm sm:inline">Per page</span>
          <Select
            value={String(size)}
            onValueChange={(value) => onSizeChange(Number(value))}
            disabled={disabled}
          >
            <SelectTrigger size="sm" className="w-[74px]" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous page"
            disabled={disabled || isFirst}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next page"
            disabled={disabled || isLast}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
