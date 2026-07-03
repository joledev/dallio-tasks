import { handle } from '@/app/api/_shared/respond';
import { parse } from '@/app/api/_shared/parse';
import { resolveOwnerId } from '@/app/api/_shared/session';
import { createUserSchema, listUsersQuerySchema } from '@/core/users/schema';
import { createUser, listUsers } from '@/core/users/use-cases';
import { userRepository } from '@/core/users/container';

export async function POST(req: Request) {
  return handle(async () => {
    const auth = resolveOwnerId();
    if (!auth.ok) return auth;
    const parsed = parse(createUserSchema, await req.json().catch(() => null), 'Invalid body');
    if (!parsed.ok) return parsed;
    return createUser(userRepository, parsed.data);
  }, 201);
}

export async function GET(req: Request) {
  return handle(async () => {
    const auth = resolveOwnerId();
    if (!auth.ok) return auth;
    const parsed = parse(
      listUsersQuerySchema,
      Object.fromEntries(new URL(req.url).searchParams),
      'Invalid query',
    );
    if (!parsed.ok) return parsed;
    return listUsers(userRepository, parsed.data);
  });
}
