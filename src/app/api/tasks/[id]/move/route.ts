import { handle } from '@/app/api/_shared/respond';
import { parse, parseId } from '@/app/api/_shared/parse';
import { resolveActingBoard } from '@/app/api/_shared/session';
import { moveTaskSchema } from '@/core/tasks/schema';
import { moveTask } from '@/core/tasks/use-cases';
import { taskRepository } from '@/core/tasks/container';
import { statusRepository } from '@/core/statuses/container';
import { boardRepository } from '@/core/boards/container';
import { eventBus } from '@/core/realtime/container';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const auth = await resolveActingBoard(boardRepository);
    if (!auth.ok) return auth;
    const id = parseId((await params).id);
    if (!id.ok) return id;
    const parsed = parse(moveTaskSchema, await req.json().catch(() => null), 'Invalid body');
    if (!parsed.ok) return parsed;
    return moveTask(taskRepository, statusRepository, auth.data, id.data, parsed.data, eventBus);
  });
}
