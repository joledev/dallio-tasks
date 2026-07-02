export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type Paginated<T> = { items: T[]; total: number; page: number; size: number };

// page is 1-based; offset skips the pages before it.
export function pageOffset(page: number, size: number): number {
  return (page - 1) * size;
}
