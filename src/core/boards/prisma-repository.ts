import type { Board as PrismaBoard } from '@prisma/client';
import { prisma } from '@/core/shared/prisma';
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
}
