import { ok, err, type Result } from '@/core/shared/envelope';
import { pageOffset, type Paginated } from '@/core/shared/pagination';
import type { UserRepository } from './repository';
import { toPublicUser, type PublicUser } from './user';
import type { CreateUserInput, ListUsersQuery } from './schema';

// Prisma unique-constraint violation code; mapped to CONFLICT so a race past the getByEmail
// pre-check surfaces cleanly instead of bubbling to a generic INTERNAL 500.
const PRISMA_UNIQUE_VIOLATION = 'P2002';

export async function createUser(
  repo: UserRepository,
  input: CreateUserInput,
): Promise<Result<PublicUser>> {
  const existing = await repo.getByEmail(input.email);
  if (existing) return err('CONFLICT', 'Email already registered');

  try {
    const user = await repo.create({
      email: input.email,
      name: input.name,
      passwordHash: null,
    });
    return ok(toPublicUser(user));
  } catch (e) {
    if ((e as { code?: string })?.code === PRISMA_UNIQUE_VIOLATION) {
      return err('CONFLICT', 'Email already registered');
    }
    throw e;
  }
}

export async function listUsers(
  repo: UserRepository,
  query: ListUsersQuery,
): Promise<Result<Paginated<PublicUser>>> {
  const { items, total } = await repo.list({
    sort: query.sort,
    dir: query.dir,
    offset: pageOffset(query.page, query.size),
    limit: query.size,
  });
  return ok({ items: items.map(toPublicUser), total, page: query.page, size: query.size });
}
