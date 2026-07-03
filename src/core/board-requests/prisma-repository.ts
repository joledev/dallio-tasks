import type {
  BoardRequest as PrismaBoardRequest,
  Participant as PrismaParticipant,
} from '@prisma/client';
import { prisma } from '@/core/shared/prisma';
import type { BoardRequestRepository, CreateBoardRequestData } from './repository';
import type { BoardRequest } from './board-request';

type Row = PrismaBoardRequest & { participant: PrismaParticipant | null };

// The requester's displayName is joined in (never persisted denormalized) — dropped the moment the
// participant is pruned (onDelete: SetNull), which is exactly when requesterName should read null.
const toBoardRequest = (row: Row): BoardRequest => ({
  id: row.id,
  boardId: row.boardId,
  participantId: row.participantId,
  kind: row.kind,
  proposedName: row.proposedName,
  status: row.status,
  requesterName: row.participant?.displayName ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export class PrismaBoardRequestRepository implements BoardRequestRepository {
  async create(input: CreateBoardRequestData) {
    const row = await prisma.boardRequest.create({
      data: input,
      include: { participant: true },
    });
    return toBoardRequest(row);
  }

  async listPendingByBoard(boardId: string) {
    const rows = await prisma.boardRequest.findMany({
      where: { boardId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: { participant: true },
    });
    return rows.map(toBoardRequest);
  }

  async getById(id: string) {
    const row = await prisma.boardRequest.findUnique({
      where: { id },
      include: { participant: true },
    });
    return row ? toBoardRequest(row) : null;
  }

  async setStatus(id: string, status: 'APPROVED' | 'REJECTED') {
    const row = await prisma.boardRequest
      .update({ where: { id }, data: { status }, include: { participant: true } })
      .catch(() => null);
    return row ? toBoardRequest(row) : null;
  }
}
