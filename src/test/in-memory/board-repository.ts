import type { BoardRepository } from '@/core/boards/repository';
import type { Board } from '@/core/boards/board';

// In-memory BoardRepository built to the same port contract. Seed boards via the constructor; lookups
// mirror the Prisma impl (first-by-owner, unique-by-shareToken).
export class InMemoryBoardRepository implements BoardRepository {
  private rows: Board[];

  constructor(seed: Board[] = []) {
    this.rows = [...seed];
  }

  async getByOwnerId(ownerId: string) {
    return this.rows.find((b) => b.ownerId === ownerId) ?? null;
  }

  async getByToken(token: string) {
    return this.rows.find((b) => b.shareToken === token) ?? null;
  }
}
