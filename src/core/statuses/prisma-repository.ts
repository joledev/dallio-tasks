import type { Status as PrismaStatus } from '@prisma/client';
import { prisma } from '@/core/shared/prisma';
import type { StatusRepository, CreateStatusData } from './repository';
import type { Status } from './status';
import type { StatusColor } from './schema';

// Prisma stores color as a widened String?; writes are constrained to the token set (schema), so the
// cast is the sanctioned boundary projection (Prisma row → domain Status).
const toStatus = (row: PrismaStatus): Status => ({
  ...row,
  color: row.color as StatusColor | null,
});

export class PrismaStatusRepository implements StatusRepository {
  async list(ownerId: string) {
    const rows = await prisma.status.findMany({ where: { ownerId }, orderBy: { position: 'asc' } });
    return rows.map(toStatus);
  }

  async getById(id: string, ownerId: string) {
    const row = await prisma.status.findFirst({ where: { id, ownerId } }); // compound owner scope
    return row ? toStatus(row) : null;
  }

  async getBySlug(ownerId: string, slug: string) {
    const row = await prisma.status.findFirst({ where: { ownerId, slug } });
    return row ? toStatus(row) : null;
  }

  async getDefault(ownerId: string) {
    // isDefault true first (false < true in PG, so desc), else the lowest position as a defensive fallback.
    const row = await prisma.status.findFirst({
      where: { ownerId },
      orderBy: [{ isDefault: 'desc' }, { position: 'asc' }],
    });
    return row ? toStatus(row) : null;
  }

  countTasks(id: string, ownerId: string) {
    return prisma.task.count({ where: { statusId: id, ownerId } }); // owner-scoped in-use count
  }

  async create(data: CreateStatusData) {
    const row = await prisma.status.create({ data });
    return toStatus(row);
  }

  async delete(id: string, ownerId: string) {
    const res = await prisma.status.deleteMany({ where: { id, ownerId } }); // scoped delete
    return res.count > 0;
  }
}
