import type { Board } from './board';

// Board lookups for the interim session seam (getByOwnerId — the seed owner acts on their own board)
// and the guest layer (getByToken). L1b-guest adds owner board-management: listByOwner (GET /api/boards)
// and createForOwner (POST /api/boards — mints a fresh shareToken and seeds the default statuses).
export interface BoardRepository {
  getById(id: string): Promise<Board | null>;
  getByOwnerId(ownerId: string): Promise<Board | null>;
  getByToken(token: string): Promise<Board | null>;
  listByOwner(ownerId: string): Promise<Board[]>;
  createForOwner(ownerId: string, name: string): Promise<Board>;
  updateMode(id: string, mode: Board['mode']): Promise<Board | null>;
  rename(id: string, name: string): Promise<Board | null>;
  deleteById(id: string): Promise<void>;
}
