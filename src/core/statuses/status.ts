import type { StatusColor } from './schema';

export type Status = {
  id: string;
  boardId: string; // IDOR anchor (was ownerId; the board is the scope from L1b)
  name: string;
  slug: string;
  position: number;
  color: StatusColor | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// Public/wire projection embedded inside a Task (§3.4) and consumed by the UI. Drops boardId +
// timestamps (authz/audit fields the client never needs).
export type StatusRef = Pick<Status, 'id' | 'name' | 'slug' | 'color' | 'position' | 'isDefault'>;

export const toStatusRef = (s: Status): StatusRef => ({
  id: s.id,
  name: s.name,
  slug: s.slug,
  color: s.color,
  position: s.position,
  isDefault: s.isDefault,
});
