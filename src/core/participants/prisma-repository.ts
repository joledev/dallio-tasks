import type { Participant as PrismaParticipant } from '@prisma/client';
import { prisma } from '@/core/shared/prisma';
import type { ParticipantRepository, CreateParticipantData } from './repository';
import type { Participant } from './participant';

// The Prisma Participant row maps 1:1 to the domain type — straight pass-through at the boundary.
const toParticipant = (row: PrismaParticipant): Participant => ({
  id: row.id,
  boardId: row.boardId,
  displayName: row.displayName,
  color: row.color,
  sessionTokenHash: row.sessionTokenHash,
  joinedAt: row.joinedAt,
  lastSeenAt: row.lastSeenAt,
});

export class PrismaParticipantRepository implements ParticipantRepository {
  async getById(id: string, boardId: string) {
    const row = await prisma.participant.findFirst({ where: { id, boardId } }); // compound board scope
    return row ? toParticipant(row) : null;
  }

  async getBySessionHash(hash: string) {
    // The partial UNIQUE index on sessionTokenHash makes this a single indexed lookup.
    const row = await prisma.participant.findFirst({ where: { sessionTokenHash: hash } });
    return row ? toParticipant(row) : null;
  }

  async create(data: CreateParticipantData) {
    const row = await prisma.participant.create({ data });
    return toParticipant(row);
  }

  countByBoard(boardId: string) {
    return prisma.participant.count({ where: { boardId } });
  }
}
