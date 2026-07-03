import { handle } from '@/app/api/_shared/respond';
import { parse } from '@/app/api/_shared/parse';
import { resolveOwnerId } from '@/app/api/_shared/session';
import { createBoardSchema } from '@/core/boards/schema';
import { listBoards, createBoard } from '@/core/boards/use-cases';
import { boardRepository } from '@/core/boards/container';
import { rateLimiter } from '@/core/realtime/container';
import { err } from '@/core/shared/envelope';

const CREATE_BOARD_LIMIT = 5;
const CREATE_BOARD_WINDOW_SEC = 60;

function requestIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip') || 'unknown';
}

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
    const limited = await rateLimiter.check(
      `board:create:${requestIp(req)}`,
      CREATE_BOARD_LIMIT,
      CREATE_BOARD_WINDOW_SEC,
    );
    if (!limited.allowed) return err('RATE_LIMITED', 'Too many board create attempts');
    const parsed = parse(createBoardSchema, await req.json().catch(() => null), 'Invalid body');
    if (!parsed.ok) return parsed;
    return createBoard(boardRepository, auth.data, parsed.data);
  }, 201);
}
