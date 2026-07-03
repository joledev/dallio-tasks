import { handle } from '@/app/api/_shared/respond';
import { resolveOwnerId } from '@/app/api/_shared/session';
import { listPendingRequests } from '@/core/board-requests/use-cases';
import { boardRepository } from '@/core/boards/container';
import { boardRequestRepository } from '@/core/board-requests/container';

type Ctx = { params: Promise<{ token: string }> };

// Owner read: the pending rename/delete request queue for a board addressed by shareToken.
export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const auth = resolveOwnerId();
    if (!auth.ok) return auth;
    const { token } = await params;
    return listPendingRequests(boardRepository, boardRequestRepository, auth.data, token);
  });
}
