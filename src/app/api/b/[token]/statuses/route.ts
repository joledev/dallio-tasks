import { cookies } from 'next/headers';
import { handleGuest } from '@/app/api/_shared/respond';
import { parse } from '@/app/api/_shared/parse';
import { resolveActor } from '@/app/api/_shared/session';
import { guestCsrfCheck } from '@/app/api/_shared/guest';
import { createStatusSchema } from '@/core/statuses/schema';
import { createStatus, listStatuses } from '@/core/statuses/use-cases';
import { statusRepository } from '@/core/statuses/container';
import { participantRepository } from '@/core/participants/container';
import { boardRepository } from '@/core/boards/container';
import { eventBus } from '@/core/realtime/container';

type Ctx = { params: Promise<{ token: string }> };

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
    const parsed = parse(createStatusSchema, await req.json().catch(() => null), 'Invalid body');
    if (!parsed.ok) return parsed;
    return createStatus(statusRepository, actor.data, parsed.data, eventBus);
  }, 201);
}

export async function GET(_req: Request, { params }: Ctx) {
  return handleGuest(async () => {
    const actor = await resolveActor(
      boardRepository,
      participantRepository,
      (await params).token,
      await cookies(),
    );
    if (!actor.ok) return actor;
    return listStatuses(statusRepository, actor.data);
  });
}
