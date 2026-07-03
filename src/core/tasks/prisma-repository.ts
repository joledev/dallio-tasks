import type { Prisma } from '@prisma/client';
import { prisma } from '@/core/shared/prisma';
import type { TaskRepository, TaskListParams, CreateTaskData, UpdateTaskData } from './repository';
import { TASK_ORDER_BY } from './repository';
import type { Task } from './task';
import { toStatusRef } from '@/core/statuses/status';
import type { StatusColor } from '@/core/statuses/schema';

// The list/get shape now joins the status relation (the one place a mapper is justified — the row
// carries a relation the DTO reshapes into a StatusRef).
const INCLUDE_STATUS = { status: true } as const;
type TaskRow = Prisma.TaskGetPayload<{ include: typeof INCLUDE_STATUS }>;

const toTask = (row: TaskRow): Task => ({
  id: row.id,
  title: row.title,
  description: row.description,
  statusId: row.statusId,
  // Reuse the canonical projection; widen the Prisma String? column to the palette token (writes are
  // constrained) and assert the nullable boardId (app always sets it — see the boardId note below).
  status: toStatusRef({
    ...row.status,
    color: row.status.color as StatusColor | null,
    boardId: row.status.boardId!,
  }),
  priority: row.priority,
  // boardId is nullable in the DB until L1c but the app always sets it (L1a backfill + a DB trigger
  // fills any interim write), so the domain treats it as non-null here.
  boardId: row.boardId!,
  assigneeParticipantId: row.assigneeParticipantId, // H1: → Participant (legacy assigneeId now dead)
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export class PrismaTaskRepository implements TaskRepository {
  async list({ filter, sort, dir, offset, limit }: TaskListParams) {
    const where: Prisma.TaskWhereInput = {
      boardId: filter.boardId, // IDOR anchor — always present
      ...(filter.statusId && { statusId: filter.statusId }),
      ...(filter.priority && { priority: filter.priority }),
      ...(filter.assigneeParticipantId && { assigneeParticipantId: filter.assigneeParticipantId }),
      ...(filter.q && { title: { contains: filter.q, mode: 'insensitive' } }),
    };
    const [items, total] = await prisma.$transaction([
      prisma.task.findMany({
        where,
        include: INCLUDE_STATUS,
        orderBy: TASK_ORDER_BY[sort](dir), // injection-safe structured orderBy
        skip: offset,
        take: limit,
      }),
      prisma.task.count({ where }), // same WHERE → filtered total
    ]);
    return { items: items.map(toTask), total };
  }

  async get(id: string, boardId: string) {
    const row = await prisma.task.findFirst({ where: { id, boardId }, include: INCLUDE_STATUS });
    return row ? toTask(row) : null; // findFirst: compound board scope
  }

  async create(data: CreateTaskData) {
    const row = await prisma.task.create({ data, include: INCLUDE_STATUS });
    return toTask(row);
  }

  async update(id: string, boardId: string, data: UpdateTaskData) {
    const res = await prisma.task.updateMany({ where: { id, boardId }, data }); // scoped write
    if (res.count === 0) return null; // miss/off-board → null (→ 404)
    const row = await prisma.task.findFirst({ where: { id, boardId }, include: INCLUDE_STATUS });
    return row ? toTask(row) : null;
  }

  async delete(id: string, boardId: string) {
    const res = await prisma.task.deleteMany({ where: { id, boardId } }); // scoped delete
    return res.count > 0;
  }
}
