import { cookies } from 'next/headers';
import { handle } from '@/app/api/_shared/respond';
import { parse, parseId } from '@/app/api/_shared/parse';
import { resolveActor } from '@/app/api/_shared/session';
import { guestCsrfCheck } from '@/app/api/_shared/guest';
import { updateTaskSchema } from '@/core/tasks/schema';
import { getTask, updateTask, deleteTask } from '@/core/tasks/use-cases';
import { taskRepository } from '@/core/tasks/container';
import { statusRepository } from '@/core/statuses/container';
import { participantRepository } from '@/core/participants/container';
import { boardRepository } from '@/core/boards/container';

type Ctx = { params: Promise<{ token: string; id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
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
    return getTask(taskRepository, actor.data, id.data);
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
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
    const parsed = parse(updateTaskSchema, await req.json().catch(() => null), 'Invalid body');
    if (!parsed.ok) return parsed;
    return updateTask(taskRepository, statusRepository, actor.data, id.data, parsed.data);
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  return handle(async () => {
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
    return deleteTask(taskRepository, actor.data, id.data);
  });
}
