import type { Board } from './board';

// Board lookups needed by the interim session seam (getByOwnerId — the seed owner acts on their own
// board) and, ahead of the guest layer, by shareToken (getByToken). Read-only in L1b.
export interface BoardRepository {
  getByOwnerId(ownerId: string): Promise<Board | null>;
  getByToken(token: string): Promise<Board | null>;
}
