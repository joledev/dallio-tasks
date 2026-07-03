import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { applyProposalEventToCache, type ProposalCacheEvent } from './board-cache';
import { boardProposalKeys } from './query-keys';
import type { ProposalDTO } from '@/app/_lib/types';

const TOKEN = 'tok-1';
const BOARD = '00000000-0000-4000-8000-00000000000a';

function proposal(id: string, over: Partial<ProposalDTO> = {}): ProposalDTO {
  return {
    id,
    boardId: BOARD,
    kind: 'CREATE_TASK',
    targetTaskId: null,
    payload: { title: 'Ship it' },
    targetVersion: null,
    status: 'PENDING',
    meta: null,
    createdByParticipantId: 'participant-1',
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    votes: [],
    ...over,
  };
}

function event(type: ProposalCacheEvent['type'], data: ProposalDTO, id = '1'): ProposalCacheEvent {
  return { id, type, boardId: BOARD, actorId: 'participant-1', ts: data.createdAt, data };
}

function read(qc: QueryClient): ProposalDTO[] {
  return qc.getQueryData<ProposalDTO[]>(boardProposalKeys(TOKEN).all) ?? [];
}

describe('applyProposalEventToCache — upsert by id (no duplicates)', () => {
  it('proposal.created inserts a first-seen proposal once', () => {
    const qc = new QueryClient();
    applyProposalEventToCache(qc, TOKEN, event('proposal.created', proposal('p1')));
    expect(read(qc).map((p) => p.id)).toEqual(['p1']);
  });

  it('a self-echoed proposal.created after the creator already inserted it does NOT duplicate', () => {
    const qc = new QueryClient();
    // Creator's mutation onSuccess seeded the cache with the proposal.
    qc.setQueryData<ProposalDTO[]>(boardProposalKeys(TOKEN).all, [proposal('p1')]);

    // The creator then receives their OWN proposal.created event over SSE.
    applyProposalEventToCache(qc, TOKEN, event('proposal.created', proposal('p1')));

    expect(read(qc).map((p) => p.id)).toEqual(['p1']); // exactly once
  });

  it('proposal.updated replaces the existing proposal in place (votes updated)', () => {
    const qc = new QueryClient();
    qc.setQueryData<ProposalDTO[]>(boardProposalKeys(TOKEN).all, [proposal('p1')]);

    const voted = proposal('p1', {
      votes: [
        {
          id: 'v1',
          proposalId: 'p1',
          participantId: 'participant-2',
          value: 'APPROVE',
          createdAt: '2020-01-01T00:00:01.000Z',
          updatedAt: '2020-01-01T00:00:01.000Z',
        },
      ],
    });
    applyProposalEventToCache(qc, TOKEN, event('proposal.updated', voted));

    const rows = read(qc);
    expect(rows).toHaveLength(1);
    expect(rows[0].votes).toHaveLength(1);
  });

  it('proposal.applied updates status to APPLIED without duplicating', () => {
    const qc = new QueryClient();
    qc.setQueryData<ProposalDTO[]>(boardProposalKeys(TOKEN).all, [proposal('p1')]);

    applyProposalEventToCache(
      qc,
      TOKEN,
      event('proposal.applied', proposal('p1', { status: 'APPLIED' })),
    );

    const rows = read(qc);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('APPLIED');
  });

  it('a first-seen proposal.updated (never created locally) is inserted once', () => {
    const qc = new QueryClient();
    applyProposalEventToCache(qc, TOKEN, event('proposal.updated', proposal('p9')));
    expect(read(qc).map((p) => p.id)).toEqual(['p9']);
  });

  it('distinct proposals coexist newest-first', () => {
    const qc = new QueryClient();
    applyProposalEventToCache(qc, TOKEN, event('proposal.created', proposal('p1')));
    applyProposalEventToCache(qc, TOKEN, event('proposal.created', proposal('p2'), '2'));
    expect(read(qc).map((p) => p.id)).toEqual(['p2', 'p1']);
  });
});
