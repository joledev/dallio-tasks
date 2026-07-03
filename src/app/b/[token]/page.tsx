import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { resolveActor } from '@/app/api/_shared/session';
import { boardRepository } from '@/core/boards/container';
import { participantRepository } from '@/core/participants/container';
import { toGuestParticipant, type GuestParticipant } from '@/core/participants/participant';
import { BoardProvider } from '@/app/_components/board-context';
import { BoardScreen } from './board-screen';

// UI-H3 — the guest board is per-visitor + cookie-authorized, so it must never be statically cached or
// prerendered: every request re-reads the httpOnly cookie and re-derives session state on the server.
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ token: string }> };

// The guest board entry. `getByToken` gates existence (unknown token → a real 404). Then `resolveActor`
// re-runs the SERVER-side session check (httpOnly cookie → sha256 → participant, same-board enforced):
// the derived `participant | null` is the single source of truth for `isJoined` (UI-H5). A joined guest
// gets the board; everyone else gets the JoinDialog. Nothing here trusts client state.
export default async function BoardPage({ params }: Params) {
  const { token } = await params;

  const board = await boardRepository.getByToken(token);
  if (!board) notFound();

  const actor = await resolveActor(boardRepository, participantRepository, token, await cookies());

  let participant: GuestParticipant | null = null;
  if (actor.ok && actor.data.participantId) {
    const row = await participantRepository.getById(actor.data.participantId, board.id);
    if (row) participant = toGuestParticipant(row);
  }

  return (
    <BoardProvider boardId={board.id} token={token} participant={participant}>
      <BoardScreen boardName={board.name} />
    </BoardProvider>
  );
}
