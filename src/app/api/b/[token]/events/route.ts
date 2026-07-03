import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { resolveActor } from '@/app/api/_shared/session';
import { respond } from '@/app/api/_shared/respond';
import { err } from '@/core/shared/envelope';
import { boardRepository } from '@/core/boards/container';
import { participantRepository } from '@/core/participants/container';
import { toPublicParticipant } from '@/core/participants/participant';
import { eventBus, presenceStore } from '@/core/realtime/container';
import { createBoardEventStream } from './stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { token } = await params;
  const present = new URL(req.url).searchParams.get('present') === '1';
  const board = present ? await boardRepository.getByToken(token) : null;
  const actor = present
    ? board
      ? ({ ok: true, data: { boardId: board.id, participantId: null } } as const)
      : err('NOT_FOUND', 'Board not found')
    : await resolveActor(boardRepository, participantRepository, token, await cookies());
  if (!actor.ok) return respond(actor);
  const publicParticipant = present
    ? {
        id: `projector:${token}`,
        boardId: actor.data.boardId,
        displayName: 'Projector',
        color: 'zinc',
      }
    : actor.data.participantId
      ? await participantRepository
          .getById(actor.data.participantId, actor.data.boardId)
          .then((participant) => (participant ? toPublicParticipant(participant) : null))
      : null;
  if (!publicParticipant) return respond(err('UNAUTHORIZED', 'Not joined'));

  const stream = createBoardEventStream(
    eventBus,
    actor.data.boardId,
    req.headers.get('last-event-id'),
    undefined,
    { presence: presenceStore, participant: publicParticipant },
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
