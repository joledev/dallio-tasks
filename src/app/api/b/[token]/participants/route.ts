import { cookies } from 'next/headers';
import { handleGuest } from '@/app/api/_shared/respond';
import { resolveActor } from '@/app/api/_shared/session';
import { listParticipants } from '@/core/participants/use-cases';
import { participantRepository } from '@/core/participants/container';
import { boardRepository } from '@/core/boards/container';

type Ctx = { params: Promise<{ token: string }> };

// GET /api/b/[token]/participants — the source for the participant picker + assignee filter.
// UI-H6: `resolveActor` gates it — a caller who holds the shareToken but has NOT joined gets
// UNAUTHORIZED, so participant names/ids are never enumerable pre-join. UI-H4: the use-case projects
// each row through `toGuestParticipant`, so the body carries `{ id, displayName, color }` only —
// never `boardId` or `sessionTokenHash`. UI-H3: `handleGuest` stamps `Cache-Control: no-store`.
export async function GET(_req: Request, { params }: Ctx) {
  return handleGuest(async () => {
    const actor = await resolveActor(
      boardRepository,
      participantRepository,
      (await params).token,
      await cookies(),
    );
    if (!actor.ok) return actor;
    return listParticipants(participantRepository, actor.data);
  });
}
