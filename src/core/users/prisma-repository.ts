import type { Prisma } from '@prisma/client';
import { prisma } from '@/core/shared/prisma';
import type { UserRepository, UserListParams, UserSortField } from './repository';

const USER_SORT: Record<UserSortField, keyof Prisma.UserOrderByWithRelationInput> = {
  createdAt: 'createdAt',
  name: 'name',
  email: 'email',
};

export class PrismaUserRepository implements UserRepository {
  async list({ sort, dir, offset, limit }: UserListParams) {
    const where: Prisma.UserWhereInput = {};
    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        orderBy: { [USER_SORT[sort]]: dir },
        skip: offset,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  getById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  }

  getByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  }

  create(data: { email: string; name: string; passwordHash: string | null }) {
    return prisma.user.create({ data });
  }
}
