import { handle } from '@/app/api/_shared/respond';
import { parse, parseId } from '@/app/api/_shared/parse';
import { resolveOwnerId } from '@/app/api/_shared/session';
import { resolveBoardRequestSchema } from '@/core/board-requests/schema';
import { resolveRequest } from '@/core/board-requests/use-cases';
import { boardRepository } from '@/core/boards/container';
import { boardRequestRepository } from '@/core/board-requests/container';

type Ctx = { params: Promise<{ token: string; id: string }> };

// Owner decision: approve or reject a pending request on a board addressed by shareToken.
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const auth = resolveOwnerId();
    if (!auth.ok) return auth;
    const { token, id } = await params;
    const requestId = parseId(id);
    if (!requestId.ok) return requestId;
    const parsed = parse(
      resolveBoardRequestSchema,
      await req.json().catch(() => null),
      'Invalid body',
    );
    if (!parsed.ok) return parsed;
    return resolveRequest(
      { boardRepo: boardRepository, boardRequestRepo: boardRequestRepository },
      auth.data,
      token,
      requestId.data,
      parsed.data.action,
    );
  });
}
