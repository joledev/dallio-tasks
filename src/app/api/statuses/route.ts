import { handle } from '@/app/api/_shared/respond';
import { parse } from '@/app/api/_shared/parse';
import { resolveActingBoard } from '@/app/api/_shared/session';
import { createStatusSchema } from '@/core/statuses/schema';
import { createStatus, listStatuses } from '@/core/statuses/use-cases';
import { statusRepository } from '@/core/statuses/container';
import { boardRepository } from '@/core/boards/container';
import { eventBus } from '@/core/realtime/container';

export async function POST(req: Request) {
  return handle(async () => {
    const auth = await resolveActingBoard(boardRepository);
    if (!auth.ok) return auth;
    const parsed = parse(createStatusSchema, await req.json().catch(() => null), 'Invalid body');
    if (!parsed.ok) return parsed;
    return createStatus(statusRepository, auth.data, parsed.data, eventBus);
  }, 201);
}

export async function GET() {
  return handle(async () => {
    const auth = await resolveActingBoard(boardRepository);
    if (!auth.ok) return auth;
    return listStatuses(statusRepository, auth.data);
  });
}
