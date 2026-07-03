import { randomUUID } from 'node:crypto';
import type {
  BoardRequestRepository,
  CreateBoardRequestData,
} from '@/core/board-requests/repository';
import type { BoardRequest } from '@/core/board-requests/board-request';

// In-memory BoardRequestRepository built to the same port contract as the Prisma impl. `requesterName`
// is resolved from the seeded `names` map (id -> displayName) so tests can assert the join without a DB.
export class InMemoryBoardRequestRepository implements BoardRequestRepository {
  private rows: BoardRequest[];
  private seq = 0;

  constructor(
    seed: BoardRequest[] = [],
    private names: Map<string, string> = new Map(),
  ) {
    this.rows = [...seed];
  }

  async create(input: CreateBoardRequestData) {
    const now = new Date(Date.UTC(2020, 0, 1) + this.seq++ * 1000);
    const row: BoardRequest = {
      id: randomUUID(),
      boardId: input.boardId,
      participantId: input.participantId,
      kind: input.kind,
      proposedName: input.proposedName,
      status: 'PENDING',
      requesterName: input.participantId ? (this.names.get(input.participantId) ?? null) : null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return row;
  }

  async listPendingByBoard(boardId: string) {
    return this.rows.filter((r) => r.boardId === boardId && r.status === 'PENDING');
  }

  async getById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  async setStatus(id: string, status: 'APPROVED' | 'REJECTED') {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return null;
    row.status = status;
    row.updatedAt = new Date();
    return row;
  }

  // Test helper (not on the port): models the BoardRequest→Board ON DELETE CASCADE. Wire this into the
  // board repo's onDelete hook so deleting a board removes its requests, reproducing the real FK.
  cascadeDeleteByBoard(boardId: string): void {
    this.rows = this.rows.filter((r) => r.boardId !== boardId);
  }
}
