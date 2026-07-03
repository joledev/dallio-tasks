import type { StatusColor } from './schema';

// The canonical default board columns, seeded onto every freshly created board (createForOwner). Same
// shape/order as the prisma seed (prisma/seed-data.ts SEED_STATUSES): todo=default pos0, in_progress
// pos1, done pos2. Ids/timestamps are assigned by the repository at insert time.
export type DefaultStatusSeed = {
  name: string;
  slug: string;
  position: number;
  color: StatusColor | null;
  isDefault: boolean;
};

export const DEFAULT_STATUS_SEED: readonly DefaultStatusSeed[] = [
  { name: 'To do', slug: 'todo', position: 0, color: null, isDefault: true },
  { name: 'In progress', slug: 'in_progress', position: 1, color: 'blue', isDefault: false },
  { name: 'Done', slug: 'done', position: 2, color: 'green', isDefault: false },
] as const;
