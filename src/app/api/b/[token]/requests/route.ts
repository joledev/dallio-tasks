import { cookies } from 'next/headers';
import { handleGuest } from '@/app/api/_shared/respond';
import { parse } from '@/app/api/_shared/parse';
import { resolveActor } from '@/app/api/_shared/session';
import { guestCsrfCheck } from '@/app/api/_shared/guest';
import { boardRepository } from '@/core/boards/container';
import { participantRepository } from '@/core/participants/container';
import { boardRequestRepository } from '@/core/board-requests/container';
import { createBoardRequestSchema } from '@/core/board-requests/schema';
import { createRequest } from '@/core/board-requests/use-cases';

type Ctx = { params: Promise<{ token: string }> };

// Guest write: request a rename or delete for the owner to approve/reject. Guests never edit/delete
// directly (see docs/engineering/guidelines.md — the owner is the sole IDOR anchor for mutation).
export async function POST(req: Request, { params }: Ctx) {
  return handleGuest(async () => {
    const csrf = guestCsrfCheck(req); // H5
    if (!csrf.ok) return csrf;
    const actor = await resolveActor(
      boardRepository,
      participantRepository,
      (await params).token,
      await cookies(),
    );
    if (!actor.ok) return actor;
    const parsed = parse(
      createBoardRequestSchema,
      await req.json().catch(() => null),
      'Invalid body',
    );
    if (!parsed.ok) return parsed;
    return createRequest(boardRequestRepository, actor.data, parsed.data);
  }, 201);
}
