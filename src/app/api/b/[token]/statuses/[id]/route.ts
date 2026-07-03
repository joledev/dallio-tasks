import { cookies } from 'next/headers';
import { handleGuest } from '@/app/api/_shared/respond';
import { parseId } from '@/app/api/_shared/parse';
import { resolveActor } from '@/app/api/_shared/session';
import { guestCsrfCheck } from '@/app/api/_shared/guest';
import { deleteStatus } from '@/core/statuses/use-cases';
import { statusRepository } from '@/core/statuses/container';
import { participantRepository } from '@/core/participants/container';
import { boardRepository } from '@/core/boards/container';

type Ctx = { params: Promise<{ token: string; id: string }> };

export async function DELETE(req: Request, { params }: Ctx) {
  return handleGuest(async () => {
    const csrf = guestCsrfCheck(req); // H5
    if (!csrf.ok) return csrf;
    const p = await params;
    const actor = await resolveActor(
      boardRepository,
      participantRepository,
      p.token,
      await cookies(),
    );
    if (!actor.ok) return actor;
    const id = parseId(p.id);
    if (!id.ok) return id;
    return deleteStatus(statusRepository, actor.data, id.data);
  });
}
