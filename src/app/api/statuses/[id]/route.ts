import { handle } from '@/app/api/_shared/respond';
import { parseId } from '@/app/api/_shared/parse';
import { resolveActingUserId } from '@/app/api/_shared/session';
import { deleteStatus } from '@/core/statuses/use-cases';
import { statusRepository } from '@/core/statuses/container';

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const auth = resolveActingUserId();
    if (!auth.ok) return auth;
    const id = parseId((await params).id);
    if (!id.ok) return id;
    return deleteStatus(statusRepository, auth.data, id.data);
  });
}
