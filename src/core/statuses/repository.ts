import type { Status } from './status';
import type { StatusColor } from './schema';

export type CreateStatusData = {
  boardId: string;
  name: string;
  slug: string;
  position: number;
  color: StatusColor | null;
  isDefault: boolean;
};

// ISP: a separate port per aggregate. Every id-addressed read is board-scoped (IDOR anchor) — a miss
// (wrong board OR nonexistent) is indistinguishable, mapping to NOT_FOUND at the use-case.
export interface StatusRepository {
  list(boardId: string): Promise<Status[]>; // ordered by position asc
  getById(id: string, boardId: string): Promise<Status | null>; // board-scoped
  getBySlug(boardId: string, slug: string): Promise<Status | null>; // dedupe pre-check
  getDefault(boardId: string): Promise<Status | null>; // isDefault row, fallback lowest position
  countTasks(id: string, boardId: string): Promise<number>; // delete-in-use guard
  create(data: CreateStatusData): Promise<Status>;
  delete(id: string, boardId: string): Promise<boolean>; // board-scoped hard delete
}
