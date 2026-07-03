import type { Board as PrismaBoard } from '@prisma/client';
import { prisma } from '@/core/shared/prisma';
import { generateShareToken } from '@/core/shared/token';
import { DEFAULT_STATUS_SEED } from '@/core/statuses/seed';
import type { BoardRepository } from './repository';
import type { Board } from './board';

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

export class PrismaBoardRepository implements BoardRepository {
  async getByOwnerId(ownerId: string) {
    // Deterministic pick: an owner is 1:1 with a board today, but multi-board-per-owner is coming —
    // oldest-first keeps the interim "acting board" stable rather than silently varying by row order.
    const row = await prisma.board.findFirst({ where: { ownerId }, orderBy: { createdAt: 'asc' } });
    return row ? toBoard(row) : null;
  }

  async getByToken(token: string) {
    const row = await prisma.board.findUnique({ where: { shareToken: token } });
    return row ? toBoard(row) : null;
  }

  async listByOwner(ownerId: string) {
    const rows = await prisma.board.findMany({ where: { ownerId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toBoard);
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
    return toBoard(row);
  }
}
