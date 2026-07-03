import { handle } from '@/app/api/_shared/respond';
import { parse } from '@/app/api/_shared/parse';
import { resolveOwnerId } from '@/app/api/_shared/session';
import { createBoardSchema } from '@/core/boards/schema';
import { listBoards, createBoard } from '@/core/boards/use-cases';
import { boardRepository } from '@/core/boards/container';

// Owner board-management. Identity is the seed owner (resolveOwnerId) — NOT the guest shareToken.
export async function GET() {
  return handle(async () => {
    const auth = resolveOwnerId();
    if (!auth.ok) return auth;
    return listBoards(boardRepository, auth.data);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const auth = resolveOwnerId();
    if (!auth.ok) return auth;
    const parsed = parse(createBoardSchema, await req.json().catch(() => null), 'Invalid body');
    if (!parsed.ok) return parsed;
    return createBoard(boardRepository, auth.data, parsed.data);
  }, 201);
}
