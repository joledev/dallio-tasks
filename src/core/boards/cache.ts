import type { Board } from './board';

export interface BoardCache {
  getByToken(token: string): Promise<Board | null>;
  setByToken(board: Board, ttlSec: number): Promise<void>;
}
