import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { resolveActor } from '@/app/api/_shared/session';
import { respond } from '@/app/api/_shared/respond';
import { boardRepository } from '@/core/boards/container';
import { participantRepository } from '@/core/participants/container';
import { eventBus } from '@/core/realtime/container';
import { createBoardEventStream } from './stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { token } = await params;
  const actor = await resolveActor(boardRepository, participantRepository, token, await cookies());
  if (!actor.ok) return respond(actor);

  const stream = createBoardEventStream(
    eventBus,
    actor.data.boardId,
    req.headers.get('last-event-id'),
  );
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
