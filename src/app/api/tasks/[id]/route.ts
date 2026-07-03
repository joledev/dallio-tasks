import { handle } from '@/app/api/_shared/respond';
import { parse, parseId } from '@/app/api/_shared/parse';
import { resolveActingBoard } from '@/app/api/_shared/session';
import { updateTaskSchema } from '@/core/tasks/schema';
import { getTask, updateTask, deleteTask } from '@/core/tasks/use-cases';
import { taskRepository } from '@/core/tasks/container';
import { statusRepository } from '@/core/statuses/container';
import { boardRepository } from '@/core/boards/container';
import { eventBus } from '@/core/realtime/container';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const auth = await resolveActingBoard(boardRepository);
    if (!auth.ok) return auth;
    const id = parseId((await params).id);
    if (!id.ok) return id;
    return getTask(taskRepository, auth.data, id.data);
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const auth = await resolveActingBoard(boardRepository);
    if (!auth.ok) return auth;
    const id = parseId((await params).id);
    if (!id.ok) return id;
    const parsed = parse(updateTaskSchema, await req.json().catch(() => null), 'Invalid body');
    if (!parsed.ok) return parsed;
    return updateTask(taskRepository, statusRepository, auth.data, id.data, parsed.data, eventBus);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const auth = await resolveActingBoard(boardRepository);
    if (!auth.ok) return auth;
    const id = parseId((await params).id);
    if (!id.ok) return id;
    return deleteTask(taskRepository, auth.data, id.data, eventBus);
  });
}
