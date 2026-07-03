import { randomUUID } from 'node:crypto';
import type { ParticipantRepository, CreateParticipantData } from '@/core/participants/repository';
import type { Participant } from '@/core/participants/participant';

// In-memory ParticipantRepository built to the same port contract: board-scoped getById (IDOR anchor),
// global getBySessionHash, and a per-board count — so the use-case unit tests exercise real behavior.
export class InMemoryParticipantRepository implements ParticipantRepository {
  private rows: Participant[];
  private seq = 0;

  constructor(seed: Participant[] = []) {
    this.rows = [...seed];
  }

  async getById(id: string, boardId: string) {
    return this.rows.find((p) => p.id === id && p.boardId === boardId) ?? null;
  }

  async getBySessionHash(hash: string) {
    return this.rows.find((p) => p.sessionTokenHash === hash) ?? null;
  }

  async create(data: CreateParticipantData) {
    const now = new Date(Date.UTC(2020, 0, 1) + this.seq++ * 1000);
    const participant: Participant = {
      id: randomUUID(),
      boardId: data.boardId,
      displayName: data.displayName,
      color: data.color,
      sessionTokenHash: data.sessionTokenHash,
      joinedAt: now,
      lastSeenAt: now,
    };
    this.rows.push(participant);
    return participant;
  }

  async countByBoard(boardId: string) {
    return this.rows.filter((p) => p.boardId === boardId).length;
  }

  async listByBoard(boardId: string) {
    return this.rows
      .filter((p) => p.boardId === boardId)
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  }
}
