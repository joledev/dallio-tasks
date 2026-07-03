import { handle } from '@/app/api/_shared/respond';
import { parse } from '@/app/api/_shared/parse';
import { resolveActingBoard } from '@/app/api/_shared/session';
import { createTaskSchema, listTasksQuerySchema } from '@/core/tasks/schema';
import { createTask, listTasks } from '@/core/tasks/use-cases';
import { taskRepository } from '@/core/tasks/container';
import { statusRepository } from '@/core/statuses/container';
import { boardRepository } from '@/core/boards/container';
import { eventBus } from '@/core/realtime/container';

export async function POST(req: Request) {
  return handle(async () => {
    const auth = await resolveActingBoard(boardRepository);
    if (!auth.ok) return auth;
    const parsed = parse(createTaskSchema, await req.json().catch(() => null), 'Invalid body');
    if (!parsed.ok) return parsed;
    return createTask(taskRepository, statusRepository, auth.data, parsed.data, eventBus);
  }, 201);
}

export async function GET(req: Request) {
  return handle(async () => {
    const auth = await resolveActingBoard(boardRepository);
    if (!auth.ok) return auth;
    const parsed = parse(
      listTasksQuerySchema,
      Object.fromEntries(new URL(req.url).searchParams),
      'Invalid query',
    );
    if (!parsed.ok) return parsed;
    return listTasks(taskRepository, auth.data, parsed.data);
  });
}
