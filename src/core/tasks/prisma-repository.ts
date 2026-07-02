import type { Prisma } from '@prisma/client';
import { prisma } from '@/core/shared/prisma';
import type {
  TaskRepository,
  TaskListParams,
  CreateTaskData,
  UpdateTaskData,
  TaskSortField,
} from './repository';

// Sort allowlist: domain field -> column. Prisma does NOT parameterize identifiers, so the incoming
// sort MUST be mapped through this fixed record (Zod already restricts it to TASK_SORT_FIELDS).
const TASK_SORT: Record<TaskSortField, keyof Prisma.TaskOrderByWithRelationInput> = {
  createdAt: 'createdAt',
  priority: 'priority',
  status: 'status',
  title: 'title',
};

export class PrismaTaskRepository implements TaskRepository {
  async list({ filter, sort, dir, offset, limit }: TaskListParams) {
    const where: Prisma.TaskWhereInput = {
      ownerId: filter.ownerId, // IDOR anchor — always present
      ...(filter.status && { status: filter.status }),
      ...(filter.priority && { priority: filter.priority }),
      ...(filter.assigneeId && { assigneeId: filter.assigneeId }),
      ...(filter.q && { title: { contains: filter.q, mode: 'insensitive' } }),
    };
    const [items, total] = await prisma.$transaction([
      prisma.task.findMany({
        where,
        orderBy: { [TASK_SORT[sort]]: dir },
        skip: offset,
        take: limit,
      }),
      prisma.task.count({ where }), // same WHERE → filtered total
    ]);
    return { items, total };
  }

  get(id: string, ownerId: string) {
    return prisma.task.findFirst({ where: { id, ownerId } }); // findFirst: compound owner scope
  }

  create(data: CreateTaskData) {
    return prisma.task.create({ data });
  }

  async update(id: string, ownerId: string, data: UpdateTaskData) {
    const res = await prisma.task.updateMany({ where: { id, ownerId }, data }); // scoped write
    if (res.count === 0) return null; // miss/not-owned → null (→ 404)
    return prisma.task.findFirst({ where: { id, ownerId } });
  }

  async delete(id: string, ownerId: string) {
    const res = await prisma.task.deleteMany({ where: { id, ownerId } }); // scoped delete
    return res.count > 0;
  }
}
