import { randomBytes, randomUUID } from 'node:crypto';
import type { BoardRepository } from '@/core/boards/repository';
import type { Board } from '@/core/boards/board';
import type { StatusRepository } from '@/core/statuses/repository';
import { DEFAULT_STATUS_SEED } from '@/core/statuses/seed';

// In-memory BoardRepository built to the same port contract. Seed boards via the constructor; lookups
// mirror the Prisma impl (first-by-owner, unique-by-shareToken). createForOwner seeds the default
// statuses onto an injected StatusRepository (the same one the use-cases read from), mirroring the
// Prisma impl's board+statuses transaction so `POST /api/boards` behavior is exercised faithfully.
export class InMemoryBoardRepository implements BoardRepository {
  private rows: Board[];
  private seq = 0;

  constructor(
    seed: Board[] = [],
    private statusRepo?: StatusRepository,
    // Models the DB's ON DELETE CASCADE fan-out (e.g. BoardRequest rows) so tests exercise the same
    // ordering constraints the real FKs impose — without it, a double masks cascade-order bugs.
    private onDelete?: (boardId: string) => void,
  ) {
    this.rows = [...seed];
  }

  async getById(id: string) {
    return this.rows.find((b) => b.id === id) ?? null;
  }

  async getByOwnerId(ownerId: string) {
    return this.rows.find((b) => b.ownerId === ownerId) ?? null;
  }

  async getByToken(token: string) {
    return this.rows.find((b) => b.shareToken === token) ?? null;
  }

  async listByOwner(ownerId: string) {
    return this.rows.filter((b) => b.ownerId === ownerId);
  }

  async createForOwner(ownerId: string, name: string) {
    const now = new Date(Date.UTC(2020, 0, 1) + this.seq++ * 1000);
    const board: Board = {
      id: randomUUID(),
      ownerId,
      name,
      shareToken: randomBytes(16).toString('hex'),
      mode: 'DIRECT',
      protected: false,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(board);
    if (this.statusRepo) {
      for (const s of DEFAULT_STATUS_SEED) {
        await this.statusRepo.create({ boardId: board.id, ...s });
      }
    }
    return board;
  }

  async updateMode(id: string, mode: Board['mode']) {
    const row = this.rows.find((b) => b.id === id);
    if (!row) return null;
    row.mode = mode;
    row.updatedAt = new Date();
    return row;
  }

  async rename(id: string, name: string) {
    const row = this.rows.find((b) => b.id === id);
    if (!row) return null;
    row.name = name;
    row.updatedAt = new Date();
    return row;
  }

  async deleteById(id: string) {
    this.rows = this.rows.filter((b) => b.id !== id);
    this.onDelete?.(id); // fan out the cascade (BoardRequest rows, etc.)
  }
}
