import { randomUUID } from 'node:crypto';
import type {
  TaskRepository,
  TaskListParams,
  CreateTaskData,
  UpdateTaskData,
} from '@/core/tasks/repository';
import type { Task } from '@/core/tasks/task';

// In-memory TaskRepository built to the same port contract as the Prisma impl. It MUST replicate
// owner-scoping (IDOR anchor), case-insensitive `q` (title contains), sort-by-field asc/desc, and
// offset/limit + filtered-count semantics — so use-case unit tests exercise the real behavior.
export class InMemoryTaskRepository implements TaskRepository {
  private rows: Task[] = [];
  private seq = 0;

  async list({ filter, sort, dir, offset, limit }: TaskListParams) {
    const matched = this.rows.filter((t) => {
      if (t.ownerId !== filter.ownerId) return false; // IDOR anchor — always applied
      if (filter.status && t.status !== filter.status) return false;
      if (filter.priority && t.priority !== filter.priority) return false;
      if (filter.assigneeId && t.assigneeId !== filter.assigneeId) return false;
      if (filter.q && !t.title.toLowerCase().includes(filter.q.toLowerCase())) return false;
      return true;
    });

    const sorted = [...matched].sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      let r = 0;
      if (av instanceof Date && bv instanceof Date) r = av.getTime() - bv.getTime();
      else if (typeof av === 'string' && typeof bv === 'string') r = av < bv ? -1 : av > bv ? 1 : 0;
      return dir === 'asc' ? r : -r;
    });

    // total is the FILTERED count (pre-pagination) — same WHERE as the page query.
    const total = sorted.length;
    const items = sorted.slice(offset, offset + limit);
    return { items, total };
  }

  async get(id: string, ownerId: string) {
    return this.rows.find((t) => t.id === id && t.ownerId === ownerId) ?? null;
  }

  async create(data: CreateTaskData) {
    // Monotonic createdAt keeps default createdAt-sort deterministic in tests.
    const now = new Date(Date.UTC(2020, 0, 1) + this.seq++ * 1000);
    const task: Task = {
      id: randomUUID(),
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      ownerId: data.ownerId,
      assigneeId: data.assigneeId,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(task);
    return task;
  }

  async update(id: string, ownerId: string, data: UpdateTaskData) {
    const task = this.rows.find((t) => t.id === id && t.ownerId === ownerId); // owner-scoped
    if (!task) return null; // miss/not-owned → null (→ 404)
    if (data.title !== undefined) task.title = data.title;
    if (data.description !== undefined) task.description = data.description;
    if (data.status !== undefined) task.status = data.status;
    if (data.priority !== undefined) task.priority = data.priority;
    if (data.assigneeId !== undefined) task.assigneeId = data.assigneeId;
    task.updatedAt = new Date();
    return task;
  }

  async delete(id: string, ownerId: string) {
    const idx = this.rows.findIndex((t) => t.id === id && t.ownerId === ownerId);
    if (idx === -1) return false; // miss/not-owned → false
    this.rows.splice(idx, 1);
    return true;
  }
}
