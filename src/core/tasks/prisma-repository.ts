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
  // Reuse the canonical projection; widen the Prisma String? column to the palette token (writes are constrained).
  status: toStatusRef({ ...row.status, color: row.status.color as StatusColor | null }),
  priority: row.priority,
  ownerId: row.ownerId,
  assigneeId: row.assigneeId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export class PrismaTaskRepository implements TaskRepository {
  async list({ filter, sort, dir, offset, limit }: TaskListParams) {
    const where: Prisma.TaskWhereInput = {
      ownerId: filter.ownerId, // IDOR anchor — always present
      ...(filter.statusId && { statusId: filter.statusId }),
      ...(filter.priority && { priority: filter.priority }),
      ...(filter.assigneeId && { assigneeId: filter.assigneeId }),
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

  async get(id: string, ownerId: string) {
    const row = await prisma.task.findFirst({ where: { id, ownerId }, include: INCLUDE_STATUS });
    return row ? toTask(row) : null; // findFirst: compound owner scope
  }

  async create(data: CreateTaskData) {
    const row = await prisma.task.create({ data, include: INCLUDE_STATUS });
    return toTask(row);
  }

  async update(id: string, ownerId: string, data: UpdateTaskData) {
    const res = await prisma.task.updateMany({ where: { id, ownerId }, data }); // scoped write
    if (res.count === 0) return null; // miss/not-owned → null (→ 404)
    const row = await prisma.task.findFirst({ where: { id, ownerId }, include: INCLUDE_STATUS });
    return row ? toTask(row) : null;
  }

  async delete(id: string, ownerId: string) {
    const res = await prisma.task.deleteMany({ where: { id, ownerId } }); // scoped delete
    return res.count > 0;
  }
}
