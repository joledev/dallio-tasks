import { cookies } from 'next/headers';
import { handleGuest } from '@/app/api/_shared/respond';
import { parse } from '@/app/api/_shared/parse';
import { resolveActor } from '@/app/api/_shared/session';
import { guestCsrfCheck } from '@/app/api/_shared/guest';
import { createTaskSchema, listTasksQuerySchema } from '@/core/tasks/schema';
import { createTask, listTasks } from '@/core/tasks/use-cases';
import { taskRepository } from '@/core/tasks/container';
import { statusRepository } from '@/core/statuses/container';
import { participantRepository } from '@/core/participants/container';
import { boardRepository } from '@/core/boards/container';
import { eventBus } from '@/core/realtime/container';
import { activityRepository } from '@/core/activity/container';

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
    const parsed = parse(createTaskSchema, await req.json().catch(() => null), 'Invalid body');
    if (!parsed.ok) return parsed;
    return createTask(
      taskRepository,
      statusRepository,
      actor.data,
      parsed.data,
      eventBus,
      activityRepository,
    );
  }, 201);
}

export async function GET(req: Request, { params }: Ctx) {
  return handleGuest(async () => {
    const actor = await resolveActor(
      boardRepository,
      participantRepository,
      (await params).token,
      await cookies(),
    );
    if (!actor.ok) return actor;
    const parsed = parse(
      listTasksQuerySchema,
      Object.fromEntries(new URL(req.url).searchParams),
      'Invalid query',
    );
    if (!parsed.ok) return parsed;
    return listTasks(taskRepository, actor.data, parsed.data);
  });
}
