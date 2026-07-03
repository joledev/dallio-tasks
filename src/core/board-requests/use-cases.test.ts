import { describe, it, expect } from 'vitest';
import { InMemoryBoardRepository } from '@/test/in-memory/board-repository';
import { InMemoryBoardRequestRepository } from '@/test/in-memory/board-request-repository';
import type { Board } from '@/core/boards/board';
import type { Actor } from '@/core/shared/actor';
import { createRequest, listPendingRequests, resolveRequest } from './use-cases';
import { createBoardRequestSchema } from './schema';

const OWNER_A = '00000000-0000-4000-8000-00000000000a';
const OWNER_B = '00000000-0000-4000-8000-00000000000b';
const PARTICIPANT_1 = '00000000-0000-4000-8000-0000000000c1';

const board = (id: string, ownerId: string, name: string, protectedFlag = false): Board => ({
  id,
  ownerId,
  name,
  shareToken: `tok-${id}`,
  mode: 'DIRECT',
  protected: protectedFlag,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('createRequest — guest files a rename/delete request', () => {
  it('creates a PENDING request for the actor’s board', async () => {
    const repo = new InMemoryBoardRequestRepository([], new Map([[PARTICIPANT_1, 'Ada']]));
    const actor: Actor = { boardId: 'b1', participantId: PARTICIPANT_1 };
    const res = await createRequest(
      repo,
      actor,
      createBoardRequestSchema.parse({ kind: 'RENAME', proposedName: 'New name' }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.status).toBe('PENDING');
    expect(res.data.kind).toBe('RENAME');
    expect(res.data.proposedName).toBe('New name');
    expect(res.data.requesterName).toBe('Ada');
    // no boardId/participantId on the public projection
    expect('boardId' in res.data).toBe(false);
    expect('participantId' in res.data).toBe(false);
  });

  it('rejects a second pending request of the same kind from the same participant', async () => {
    const repo = new InMemoryBoardRequestRepository();
    const actor: Actor = { boardId: 'b1', participantId: PARTICIPANT_1 };
    const first = await createRequest(
      repo,
      actor,
      createBoardRequestSchema.parse({ kind: 'DELETE' }),
    );
    expect(first.ok).toBe(true);
    const second = await createRequest(
      repo,
      actor,
      createBoardRequestSchema.parse({ kind: 'DELETE' }),
    );
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe('CONFLICT');
  });
});

describe('listPendingRequests — owner-scoped, addressed by shareToken', () => {
  it('returns NOT_FOUND when the caller does not own the board (IDOR)', async () => {
    const boardRepo = new InMemoryBoardRepository([board('b1', OWNER_A, 'A-1')]);
    const requestRepo = new InMemoryBoardRequestRepository();
    const res = await listPendingRequests(boardRepo, requestRepo, OWNER_B, 'tok-b1');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('NOT_FOUND');
  });

  it('returns only PENDING requests for the board', async () => {
    const boardRepo = new InMemoryBoardRepository([board('b1', OWNER_A, 'A-1')]);
    const requestRepo = new InMemoryBoardRequestRepository();
    await createRequest(
      requestRepo,
      { boardId: 'b1', participantId: PARTICIPANT_1 },
      createBoardRequestSchema.parse({ kind: 'DELETE' }),
    );
    const res = await listPendingRequests(boardRepo, requestRepo, OWNER_A, 'tok-b1');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toHaveLength(1);
    expect(res.data[0].kind).toBe('DELETE');
  });
});

describe('resolveRequest — owner approves/rejects a pending request', () => {
  it('returns NOT_FOUND when the caller does not own the board (IDOR)', async () => {
    const boardRepo = new InMemoryBoardRepository([board('b1', OWNER_A, 'A-1')]);
    const requestRepo = new InMemoryBoardRequestRepository();
    const created = await createRequest(
      requestRepo,
      { boardId: 'b1', participantId: PARTICIPANT_1 },
      createBoardRequestSchema.parse({ kind: 'DELETE' }),
    );
    if (!created.ok) throw new Error('expected ok');
    const res = await resolveRequest(
      { boardRepo, boardRequestRepo: requestRepo },
      OWNER_B,
      'tok-b1',
      created.data.id,
      'approve',
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('NOT_FOUND');
  });

  it('reject marks the request REJECTED and leaves the board untouched', async () => {
    const boardRepo = new InMemoryBoardRepository([board('b1', OWNER_A, 'A-1')]);
    const requestRepo = new InMemoryBoardRequestRepository();
    const created = await createRequest(
      requestRepo,
      { boardId: 'b1', participantId: PARTICIPANT_1 },
      createBoardRequestSchema.parse({ kind: 'RENAME', proposedName: 'Hijacked' }),
    );
    if (!created.ok) throw new Error('expected ok');
    const res = await resolveRequest(
      { boardRepo, boardRequestRepo: requestRepo },
      OWNER_A,
      'tok-b1',
      created.data.id,
      'reject',
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.status).toBe('REJECTED');
    expect((await boardRepo.getByToken('tok-b1'))?.name).toBe('A-1');
  });

  it('approve RENAME applies the new name and marks APPROVED', async () => {
    const boardRepo = new InMemoryBoardRepository([board('b1', OWNER_A, 'Old name')]);
    const requestRepo = new InMemoryBoardRequestRepository();
    const created = await createRequest(
      requestRepo,
      { boardId: 'b1', participantId: PARTICIPANT_1 },
      createBoardRequestSchema.parse({ kind: 'RENAME', proposedName: 'New name' }),
    );
    if (!created.ok) throw new Error('expected ok');
    const res = await resolveRequest(
      { boardRepo, boardRequestRepo: requestRepo },
      OWNER_A,
      'tok-b1',
      created.data.id,
      'approve',
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.status).toBe('APPROVED');
    expect((await boardRepo.getByToken('tok-b1'))?.name).toBe('New name');
  });

  it('approve DELETE on a protected board is FORBIDDEN and the board still exists', async () => {
    const boardRepo = new InMemoryBoardRepository([board('b1', OWNER_A, 'Demo', true)]);
    const requestRepo = new InMemoryBoardRequestRepository();
    const created = await createRequest(
      requestRepo,
      { boardId: 'b1', participantId: PARTICIPANT_1 },
      createBoardRequestSchema.parse({ kind: 'DELETE' }),
    );
    if (!created.ok) throw new Error('expected ok');
    const res = await resolveRequest(
      { boardRepo, boardRequestRepo: requestRepo },
      OWNER_A,
      'tok-b1',
      created.data.id,
      'approve',
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('FORBIDDEN');
    expect(await boardRepo.getByToken('tok-b1')).not.toBeNull();
    // The request is left PENDING, not silently marked applied.
    const stillPending = await requestRepo.getById(created.data.id);
    expect(stillPending?.status).toBe('PENDING');
  });

  it('approve DELETE on an unprotected board deletes it and marks APPROVED', async () => {
    // Wire the FK cascade: deleting the board removes its BoardRequest rows (ON DELETE CASCADE). This
    // reproduces the real DB — approve-DELETE must mark APPROVED and capture the projection BEFORE the
    // delete cascades the request row away, or setStatus afterward hits a vanished row → false NOT_FOUND.
    const requestRepo = new InMemoryBoardRequestRepository();
    const boardRepo = new InMemoryBoardRepository(
      [board('b1', OWNER_A, 'A-1')],
      undefined,
      (boardId) => requestRepo.cascadeDeleteByBoard(boardId),
    );
    const created = await createRequest(
      requestRepo,
      { boardId: 'b1', participantId: PARTICIPANT_1 },
      createBoardRequestSchema.parse({ kind: 'DELETE' }),
    );
    if (!created.ok) throw new Error('expected ok');
    const res = await resolveRequest(
      { boardRepo, boardRequestRepo: requestRepo },
      OWNER_A,
      'tok-b1',
      created.data.id,
      'approve',
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.status).toBe('APPROVED');
    expect(await boardRepo.getByToken('tok-b1')).toBeNull();
    // The request row is gone (cascaded), but the owner still got a truthful APPROVED result.
    expect(await requestRepo.getById(created.data.id)).toBeNull();
  });
});
