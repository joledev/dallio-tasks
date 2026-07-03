import type { Status as PrismaStatus } from '@prisma/client';
import { prisma } from '@/core/shared/prisma';
import type { StatusRepository, CreateStatusData } from './repository';
import type { Status } from './status';
import type { StatusColor } from './schema';

// Prisma stores color as a widened String?; writes are constrained to the token set (schema), so the
// cast is the sanctioned boundary projection (Prisma row → domain Status). boardId is non-null since
// L1c-b.
const toStatus = (row: PrismaStatus): Status => ({
  id: row.id,
  boardId: row.boardId,
  name: row.name,
  slug: row.slug,
  position: row.position,
  color: row.color as StatusColor | null,
  isDefault: row.isDefault,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export class PrismaStatusRepository implements StatusRepository {
  async list(boardId: string) {
    const rows = await prisma.status.findMany({ where: { boardId }, orderBy: { position: 'asc' } });
    return rows.map(toStatus);
  }

  async getById(id: string, boardId: string) {
    const row = await prisma.status.findFirst({ where: { id, boardId } }); // compound board scope
    return row ? toStatus(row) : null;
  }

  async getBySlug(boardId: string, slug: string) {
    const row = await prisma.status.findFirst({ where: { boardId, slug } });
    return row ? toStatus(row) : null;
  }

  async getDefault(boardId: string) {
    // isDefault true first (false < true in PG, so desc), else the lowest position as a defensive fallback.
    const row = await prisma.status.findFirst({
      where: { boardId },
      orderBy: [{ isDefault: 'desc' }, { position: 'asc' }],
    });
    return row ? toStatus(row) : null;
  }

  countTasks(id: string, boardId: string) {
    return prisma.task.count({ where: { statusId: id, boardId } }); // board-scoped in-use count
  }

  async create(data: CreateStatusData) {
    const row = await prisma.status.create({ data });
    return toStatus(row);
  }

  async delete(id: string, boardId: string) {
    const res = await prisma.status.deleteMany({ where: { id, boardId } }); // scoped delete
    return res.count > 0;
  }
}
