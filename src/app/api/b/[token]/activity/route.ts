import { cookies } from 'next/headers';
import { handleGuest } from '@/app/api/_shared/respond';
import { resolveActor } from '@/app/api/_shared/session';
import { listRecentActivity } from '@/core/activity/use-cases';
import { activityRepository } from '@/core/activity/container';
import { boardRepository } from '@/core/boards/container';
import { participantRepository } from '@/core/participants/container';
import { ok } from '@/core/shared/envelope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

export async function GET(req: Request, { params }: Ctx) {
  return handleGuest(async () => {
    const token = (await params).token;
    const present = new URL(req.url).searchParams.get('present') === '1';
    const board = present ? await boardRepository.getByToken(token) : null;
    const actor = present
      ? board
        ? ok({ boardId: board.id, participantId: null })
        : ({ ok: false, error: { code: 'NOT_FOUND', message: 'Board not found' } } as const)
      : await resolveActor(boardRepository, participantRepository, token, await cookies());
    if (!actor.ok) return actor;
    return listRecentActivity(activityRepository, actor.data);
  });
}
