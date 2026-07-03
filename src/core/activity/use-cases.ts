import { ok, type Result } from '@/core/shared/envelope';
import type { Actor } from '@/core/shared/actor';
import { toActivityDTO, type ActivityDTO } from './activity';
import type { ActivityRepository } from './repository';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;

export async function listRecentActivity(
  repo: ActivityRepository,
  actor: Actor,
  limit = DEFAULT_LIMIT,
): Promise<Result<ActivityDTO[]>> {
  const bounded = Math.max(1, Math.min(MAX_LIMIT, limit));
  const rows = await repo.listRecent(actor.boardId, bounded);
  return ok(rows.map(toActivityDTO));
}
