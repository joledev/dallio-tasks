import { cookies } from 'next/headers';
import { handleGuest } from '@/app/api/_shared/respond';
import { resolveActor } from '@/app/api/_shared/session';
import { listRecentActivity } from '@/core/activity/use-cases';
import { activityRepository } from '@/core/activity/container';
import { boardRepository } from '@/core/boards/container';
import { participantRepository } from '@/core/participants/container';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    return listRecentActivity(activityRepository, actor.data);
  });
}
