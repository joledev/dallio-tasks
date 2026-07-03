import { cookies } from 'next/headers';
import { handleGuest } from '@/app/api/_shared/respond';
import { parse } from '@/app/api/_shared/parse';
import { resolveActor } from '@/app/api/_shared/session';
import { guestCsrfCheck } from '@/app/api/_shared/guest';
import { ok } from '@/core/shared/envelope';
import { boardRepository } from '@/core/boards/container';
import { participantRepository } from '@/core/participants/container';
import { boardModeSchema } from '@/core/proposals/schema';
import { setBoardMode } from '@/core/proposals/use-cases';

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handleGuest(async () => {
    const actor = await resolveActor(
      boardRepository,
      participantRepository,
      (await params).token,
      await cookies(),
    );
    if (!actor.ok) return actor;
    const board = await boardRepository.getById(actor.data.boardId);
    return board
      ? ok({ mode: board.mode })
      : { ok: false, error: { code: 'NOT_FOUND', message: 'Board not found' } };
  });
}

export async function POST(req: Request, { params }: Ctx) {
  return handleGuest(async () => {
    const csrf = guestCsrfCheck(req);
    if (!csrf.ok) return csrf;
    const actor = await resolveActor(
      boardRepository,
      participantRepository,
      (await params).token,
      await cookies(),
    );
    if (!actor.ok) return actor;
    const parsed = parse(boardModeSchema, await req.json().catch(() => null), 'Invalid body');
    if (!parsed.ok) return parsed;
    return setBoardMode(
      { boardRepo: boardRepository, participantRepo: participantRepository },
      actor.data,
      parsed.data.mode,
    );
  });
}
