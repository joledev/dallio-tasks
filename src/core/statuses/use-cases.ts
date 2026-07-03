import { ok, err, type Result } from '@/core/shared/envelope';
import type { Actor } from '@/core/shared/actor';
import { logger } from '@/core/shared/logger';
import type { EventPublisher } from '@/core/realtime/event-bus';
import { statusCreated, statusDeleted } from '@/core/realtime/events';
import type { StatusRepository } from './repository';
import { toStatusRef, type Status } from './status';
import { slugifyStatus, type CreateStatusInput } from './schema';

// Fire-and-forget publish, mirroring the task use-cases: a bus failure must never fail the mutation
// (the DB write already happened), so we swallow + log with a scrubbed error shape.
function publishStatusEvent(
  publisher: EventPublisher | undefined,
  boardId: string,
  event: ReturnType<typeof statusCreated | typeof statusDeleted>,
) {
  if (!publisher) return;
  void publisher.publish(boardId, event).catch((e) => {
    const scrubbed = e as { name?: string; code?: string };
    logger.error(
      { err: { name: scrubbed?.name, code: scrubbed?.code }, boardId },
      'event publish failed',
    );
  });
}

export async function createStatus(
  repo: StatusRepository,
  actor: Actor,
  input: CreateStatusInput,
  publisher?: EventPublisher,
): Promise<Result<Status>> {
  const slug = slugifyStatus(input.name);
  if (!slug) return err('VALIDATION_ERROR', 'Status name must contain letters or numbers');

  // Explicit dedupe pre-check (clearer than catching P2002); the @@unique index is the belt.
  const existing = await repo.getBySlug(actor.boardId, slug);
  if (existing) return err('CONFLICT', 'A status with that name already exists');

  // Append: position = max(position) + 1. isDefault is never set on create (§7).
  const statuses = await repo.list(actor.boardId);
  const position = statuses.reduce((max, s) => Math.max(max, s.position), -1) + 1;

  const status = await repo.create({
    boardId: actor.boardId,
    name: input.name,
    slug,
    position,
    color: input.color ?? null,
    isDefault: false,
  });
  publishStatusEvent(
    publisher,
    actor.boardId,
    statusCreated(actor.boardId, actor.participantId, toStatusRef(status)),
  );
  return ok(status);
}

export async function listStatuses(
  repo: StatusRepository,
  actor: Actor,
): Promise<Result<Status[]>> {
  return ok(await repo.list(actor.boardId));
}

export async function deleteStatus(
  repo: StatusRepository,
  actor: Actor,
  id: string,
  publisher?: EventPublisher,
): Promise<Result<null>> {
  const status = await repo.getById(id, actor.boardId);
  if (!status) return err('NOT_FOUND', 'Status not found'); // miss/off-board → 404 (no disclosure)
  if (status.isDefault) return err('CONFLICT', 'Cannot delete the default status');

  const inUse = await repo.countTasks(id, actor.boardId);
  if (inUse > 0) return err('CONFLICT', 'Status is in use');

  await repo.delete(id, actor.boardId);
  publishStatusEvent(
    publisher,
    actor.boardId,
    statusDeleted(actor.boardId, actor.participantId, id),
  );
  return ok(null);
}
