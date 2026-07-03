import type { Board as PrismaBoard } from '@prisma/client';
import { prisma } from '@/core/shared/prisma';
import { generateShareToken } from '@/core/shared/token';
import { DEFAULT_STATUS_SEED } from '@/core/statuses/seed';
import type { BoardRepository } from './repository';
import type { Board } from './board';
import type { BoardCache } from './cache';

// The Prisma Board row maps 1:1 to the domain Board (all fields present + typed), so the projection is
// a straight pass-through at this boundary.
const toBoard = (row: PrismaBoard): Board => ({
  id: row.id,
  ownerId: row.ownerId,
  name: row.name,
  shareToken: row.shareToken,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const TOKEN_CACHE_TTL_SEC = 300;

export class PrismaBoardRepository implements BoardRepository {
  constructor(private readonly cache?: BoardCache) {}

  private async cachedByToken(token: string): Promise<Board | null> {
    try {
      return (await this.cache?.getByToken(token)) ?? null;
    } catch {
      return null;
    }
  }

  private async cacheByToken(board: Board): Promise<void> {
    try {
      await this.cache?.setByToken(board, TOKEN_CACHE_TTL_SEC);
    } catch {
      // Redis is an acceleration layer for token lookups; the database remains authoritative.
    }
  }

  async getByOwnerId(ownerId: string) {
    // Deterministic pick: an owner is 1:1 with a board today, but multi-board-per-owner is coming —
    // oldest-first keeps the interim "acting board" stable rather than silently varying by row order.
    const row = await prisma.board.findFirst({ where: { ownerId }, orderBy: { createdAt: 'asc' } });
    return row ? toBoard(row) : null;
  }

  async getByToken(token: string) {
    const cached = await this.cachedByToken(token);
    if (cached) return cached;
    const row = await prisma.board.findUnique({ where: { shareToken: token } });
    if (!row) return null;
    const board = toBoard(row);
    await this.cacheByToken(board);
    return board;
  }

  async listByOwner(ownerId: string) {
    const rows = await prisma.board.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { tasks: true } } },
    });
    return rows.map((row) => ({ ...toBoard(row), taskCount: row._count.tasks }));
  }

  async createForOwner(ownerId: string, name: string) {
    // Board + its default status columns are created atomically so a new board is never left without
    // a default status (createTask falls back to it). shareToken is a fresh, unguessable 128-bit hex.
    const row = await prisma.$transaction(async (tx) => {
      const board = await tx.board.create({
        data: { ownerId, name, shareToken: generateShareToken() },
      });
      await tx.status.createMany({
        data: DEFAULT_STATUS_SEED.map((s) => ({ boardId: board.id, ...s })),
      });
      return board;
    });
    const board = toBoard(row);
    await this.cacheByToken(board);
    return board;
  }
}
