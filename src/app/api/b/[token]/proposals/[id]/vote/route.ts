import { cookies } from 'next/headers';
import { handleGuest } from '@/app/api/_shared/respond';
import { parse, parseId } from '@/app/api/_shared/parse';
import { resolveActor } from '@/app/api/_shared/session';
import { guestCsrfCheck } from '@/app/api/_shared/guest';
import { boardRepository } from '@/core/boards/container';
import { participantRepository } from '@/core/participants/container';
import { taskRepository } from '@/core/tasks/container';
import { statusRepository } from '@/core/statuses/container';
import { eventBus, presenceStore } from '@/core/realtime/container';
import { activityRepository } from '@/core/activity/container';
import { proposalRepository } from '@/core/proposals/container';
import { voteSchema } from '@/core/proposals/schema';
import { voteOnProposal, type ProposalDeps } from '@/core/proposals/use-cases';

type Ctx = { params: Promise<{ token: string; id: string }> };

function deps(): ProposalDeps {
  return {
    proposalRepo: proposalRepository,
    boardRepo: boardRepository,
    taskRepo: taskRepository,
    statusRepo: statusRepository,
    participantRepo: participantRepository,
    presence: presenceStore,
    publisher: eventBus,
    activityRepo: activityRepository,
  };
}

export async function POST(req: Request, { params }: Ctx) {
  return handleGuest(async () => {
    const csrf = guestCsrfCheck(req);
    if (!csrf.ok) return csrf;
    const p = await params;
    const actor = await resolveActor(
      boardRepository,
      participantRepository,
      p.token,
      await cookies(),
    );
    if (!actor.ok) return actor;
    const id = parseId(p.id);
    if (!id.ok) return id;
    const parsed = parse(voteSchema, await req.json().catch(() => null), 'Invalid body');
    if (!parsed.ok) return parsed;
    return voteOnProposal(deps(), actor.data, id.data, parsed.data);
  });
}
