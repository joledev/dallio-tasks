import type { Status } from './status';
import type { StatusColor } from './schema';

export type CreateStatusData = {
  ownerId: string;
  name: string;
  slug: string;
  position: number;
  color: StatusColor | null;
  isDefault: boolean;
};

// ISP: a separate port per aggregate. Every id-addressed read is owner-scoped (IDOR anchor) — a miss
// (wrong owner OR nonexistent) is indistinguishable, mapping to NOT_FOUND at the use-case.
export interface StatusRepository {
  list(ownerId: string): Promise<Status[]>; // ordered by position asc
  getById(id: string, ownerId: string): Promise<Status | null>; // owner-scoped
  getBySlug(ownerId: string, slug: string): Promise<Status | null>; // dedupe pre-check
  getDefault(ownerId: string): Promise<Status | null>; // isDefault row, fallback lowest position
  countTasks(id: string, ownerId: string): Promise<number>; // delete-in-use guard
  create(data: CreateStatusData): Promise<Status>;
  delete(id: string, ownerId: string): Promise<boolean>; // owner-scoped hard delete
}
