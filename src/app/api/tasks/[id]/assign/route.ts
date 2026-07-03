import { handle } from '@/app/api/_shared/respond';
import { parse, parseId } from '@/app/api/_shared/parse';
import { resolveActingBoard } from '@/app/api/_shared/session';
import { assignTaskSchema } from '@/core/tasks/schema';
import { assignTask } from '@/core/tasks/use-cases';
import { taskRepository } from '@/core/tasks/container';
import { userRepository } from '@/core/users/container';
import { boardRepository } from '@/core/boards/container';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const auth = await resolveActingBoard(boardRepository);
    if (!auth.ok) return auth;
    const id = parseId((await params).id);
    if (!id.ok) return id;
    const parsed = parse(assignTaskSchema, await req.json().catch(() => null), 'Invalid body');
    if (!parsed.ok) return parsed;
    return assignTask(taskRepository, userRepository, auth.data, id.data, parsed.data);
  });
}
