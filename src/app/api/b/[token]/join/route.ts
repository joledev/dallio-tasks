import { cookies } from 'next/headers';
import { respond, noStore } from '@/app/api/_shared/respond';
import { parse } from '@/app/api/_shared/parse';
import { guestCookie, guestCookieName, guestCsrfCheck } from '@/app/api/_shared/guest';
import { ok, err } from '@/core/shared/envelope';
import { logger } from '@/core/shared/logger';
import { joinBoardSchema } from '@/core/participants/schema';
import { joinBoard } from '@/core/participants/use-cases';
import { toPublicParticipant } from '@/core/participants/participant';
import { participantRepository } from '@/core/participants/container';
import { boardRepository } from '@/core/boards/container';

type Ctx = { params: Promise<{ token: string }> };

// POST /api/b/[token]/join — the public board-entry write. On a fresh join it sets the opaque guest
// cookie (H4); on an idempotent rejoin (H2) it returns the existing participant and sets nothing new.
// The raw token is delivered ONLY via the httpOnly Set-Cookie, never in the response body (H6).
export async function POST(req: Request, { params }: Ctx) {
  try {
    const csrf = guestCsrfCheck(req); // H5
    if (!csrf.ok) return noStore(respond(csrf));

    const shareToken = (await params).token;
    const store = await cookies();
    const existing = store.get(guestCookieName())?.value ?? null;

    const parsed = parse(joinBoardSchema, await req.json().catch(() => null), 'Invalid body');
    if (!parsed.ok) return noStore(respond(parsed));

    const result = await joinBoard(
      participantRepository,
      boardRepository,
      shareToken,
      parsed.data,
      existing,
    );
    if (!result.ok) return noStore(respond(result));

    // Body carries the safe public participant only — the raw token stays out of the body (H6).
    const res = noStore(
      respond(
        ok({
          participant: toPublicParticipant(result.data.participant),
          boardId: result.data.actor.boardId,
        }),
      ),
    );
    if (result.data.token) res.cookies.set(guestCookie(result.data.token)); // fresh join only
    return res;
  } catch (e) {
    const scrubbed = e as { name?: string; code?: string };
    logger.error({ err: { name: scrubbed?.name, code: scrubbed?.code } }, 'join route error');
    return noStore(respond(err('INTERNAL', 'Internal error'), 500));
  }
}
