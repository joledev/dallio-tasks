import { randomUUID } from 'node:crypto';
import type { StatusRepository, CreateStatusData } from '@/core/statuses/repository';
import type { Status, StatusRef } from '@/core/statuses/status';
import { toStatusRef } from '@/core/statuses/status';

// In-memory StatusRepository built to the same port contract: board-scoping, position ordering, and
// isDefault-first default resolution — so status use-case unit tests exercise the real behavior.
export class InMemoryStatusRepository implements StatusRepository {
  private rows: Status[] = [];
  private seq = 0;

  // The delete-in-use guard reads live task counts; tests wire this (e.g. to the in-memory task repo).
  taskCounter: (statusId: string, boardId: string) => number = () => 0;

  async list(boardId: string) {
    return this.rows.filter((s) => s.boardId === boardId).sort((a, b) => a.position - b.position);
  }

  async getById(id: string, boardId: string) {
    return this.rows.find((s) => s.id === id && s.boardId === boardId) ?? null;
  }

  async getBySlug(boardId: string, slug: string) {
    return this.rows.find((s) => s.boardId === boardId && s.slug === slug) ?? null;
  }

  async getDefault(boardId: string) {
    const owned = await this.list(boardId);
    return owned.find((s) => s.isDefault) ?? owned[0] ?? null; // isDefault, else lowest position
  }

  async countTasks(id: string, boardId: string) {
    return this.taskCounter(id, boardId);
  }

  async create(data: CreateStatusData) {
    const now = new Date(Date.UTC(2020, 0, 1) + this.seq++ * 1000);
    const status: Status = {
      id: randomUUID(),
      boardId: data.boardId,
      name: data.name,
      slug: data.slug,
      position: data.position,
      color: data.color,
      isDefault: data.isDefault,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(status);
    return status;
  }

  async delete(id: string, boardId: string) {
    const idx = this.rows.findIndex((s) => s.id === id && s.boardId === boardId);
    if (idx === -1) return false;
    this.rows.splice(idx, 1);
    return true;
  }

  // Sync ref lookup backing the in-memory task repo's statusLookup (StatusRef materialization + sort).
  refById(id: string): StatusRef | undefined {
    const s = this.rows.find((r) => r.id === id);
    return s ? toStatusRef(s) : undefined;
  }
}
