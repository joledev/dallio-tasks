import { randomUUID } from 'node:crypto';
import type {
  TaskRepository,
  TaskListParams,
  TaskSortField,
  CreateTaskData,
  UpdateTaskData,
} from '@/core/tasks/repository';
import type { Task } from '@/core/tasks/task';
import type { StatusRef } from '@/core/statuses/status';

// Rows store the scalar statusId; the joined `status: StatusRef` is materialized on read via the
// injected statusLookup (mirrors the Prisma `include: { status: true }`).
type TaskRow = Omit<Task, 'status'>;

// In-memory TaskRepository built to the same port contract as the Prisma impl. It MUST replicate
// board-scoping (IDOR anchor), case-insensitive `q` (title contains), sort-by-field asc/desc (incl.
// `status` → joined Status.position), and offset/limit + filtered-count semantics — so use-case unit
// tests exercise the real behavior.
export class InMemoryTaskRepository implements TaskRepository {
  private rows: TaskRow[] = [];
  private seq = 0;

  constructor(private statusLookup: (id: string) => StatusRef | undefined = () => undefined) {}

  private materialize(row: TaskRow): Task {
    const status = this.statusLookup(row.statusId);
    if (!status) throw new Error(`InMemoryTaskRepository: no StatusRef for ${row.statusId}`);
    return { ...row, status };
  }

  private compare(a: TaskRow, b: TaskRow, sort: TaskSortField): number {
    if (sort === 'status') {
      const ap = this.statusLookup(a.statusId)?.position ?? 0;
      const bp = this.statusLookup(b.statusId)?.position ?? 0;
      return ap - bp;
    }
    const av = a[sort];
    const bv = b[sort];
    if (av instanceof Date && bv instanceof Date) return av.getTime() - bv.getTime();
    if (typeof av === 'string' && typeof bv === 'string') return av < bv ? -1 : av > bv ? 1 : 0;
    return 0;
  }

  async list({ filter, sort, dir, offset, limit }: TaskListParams) {
    const matched = this.rows.filter((t) => {
      if (t.boardId !== filter.boardId) return false; // IDOR anchor — always applied
      if (filter.statusId && t.statusId !== filter.statusId) return false;
      if (filter.priority && t.priority !== filter.priority) return false;
      if (filter.assigneeParticipantId && t.assigneeParticipantId !== filter.assigneeParticipantId)
        return false;
      if (filter.q && !t.title.toLowerCase().includes(filter.q.toLowerCase())) return false;
      return true;
    });

    const sorted = [...matched].sort((a, b) => {
      const r = this.compare(a, b, sort);
      return dir === 'asc' ? r : -r;
    });

    // total is the FILTERED count (pre-pagination) — same WHERE as the page query.
    const total = sorted.length;
    const items = sorted.slice(offset, offset + limit).map((row) => this.materialize(row));
    return { items, total };
  }

  async get(id: string, boardId: string) {
    const row = this.rows.find((t) => t.id === id && t.boardId === boardId);
    return row ? this.materialize(row) : null;
  }

  async create(data: CreateTaskData) {
    // Monotonic createdAt keeps default createdAt-sort deterministic in tests.
    const now = new Date(Date.UTC(2020, 0, 1) + this.seq++ * 1000);
    const row: TaskRow = {
      id: randomUUID(),
      title: data.title,
      description: data.description,
      statusId: data.statusId,
      priority: data.priority,
      boardId: data.boardId,
      assigneeParticipantId: data.assigneeParticipantId,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return this.materialize(row);
  }

  async update(id: string, boardId: string, data: UpdateTaskData) {
    const row = this.rows.find((t) => t.id === id && t.boardId === boardId); // board-scoped
    if (!row) return null; // miss/off-board → null (→ 404)
    if (data.title !== undefined) row.title = data.title;
    if (data.description !== undefined) row.description = data.description;
    if (data.statusId !== undefined) row.statusId = data.statusId;
    if (data.priority !== undefined) row.priority = data.priority;
    if (data.assigneeParticipantId !== undefined)
      row.assigneeParticipantId = data.assigneeParticipantId;
    row.updatedAt = new Date();
    return this.materialize(row);
  }

  async delete(id: string, boardId: string) {
    const idx = this.rows.findIndex((t) => t.id === id && t.boardId === boardId);
    if (idx === -1) return false; // miss/off-board → false
    this.rows.splice(idx, 1);
    return true;
  }
}
