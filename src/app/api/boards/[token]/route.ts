import { handle } from '@/app/api/_shared/respond';
import { parse } from '@/app/api/_shared/parse';
import { resolveOwnerId } from '@/app/api/_shared/session';
import { renameBoardSchema } from '@/core/boards/schema';
import { renameBoard, deleteBoard } from '@/core/boards/use-cases';
import { boardRepository } from '@/core/boards/container';

type Ctx = { params: Promise<{ token: string }> };

// Owner-direct board management, addressed by shareToken (never boardId — see boards/board.ts).
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const auth = resolveOwnerId();
    if (!auth.ok) return auth;
    const { token } = await params;
    const parsed = parse(renameBoardSchema, await req.json().catch(() => null), 'Invalid body');
    if (!parsed.ok) return parsed;
    return renameBoard(boardRepository, auth.data, token, parsed.data.name);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const auth = resolveOwnerId();
    if (!auth.ok) return auth;
    const { token } = await params;
    return deleteBoard(boardRepository, auth.data, token);
  });
}
