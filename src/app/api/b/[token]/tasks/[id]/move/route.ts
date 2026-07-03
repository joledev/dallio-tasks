import { cookies } from 'next/headers';
import { handleGuest } from '@/app/api/_shared/respond';
import { parse, parseId } from '@/app/api/_shared/parse';
import { resolveActor } from '@/app/api/_shared/session';
import { guestCsrfCheck } from '@/app/api/_shared/guest';
import { moveTaskSchema } from '@/core/tasks/schema';
import { moveTask } from '@/core/tasks/use-cases';
import { taskRepository } from '@/core/tasks/container';
import { statusRepository } from '@/core/statuses/container';
import { participantRepository } from '@/core/participants/container';
import { boardRepository } from '@/core/boards/container';
import { eventBus } from '@/core/realtime/container';
import { activityRepository } from '@/core/activity/container';

type Ctx = { params: Promise<{ token: string; id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  return handleGuest(async () => {
    const csrf = guestCsrfCheck(req);
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
    const parsed = parse(moveTaskSchema, await req.json().catch(() => null), 'Invalid body');
    if (!parsed.ok) return parsed;
    return moveTask(
      taskRepository,
      statusRepository,
      actor.data,
      id.data,
      parsed.data,
      eventBus,
      activityRepository,
    );
  });
}
