import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  taskKeys,
  boardKeys,
  boardTaskKeys,
  boardStatusKeys,
  boardParticipantKeys,
  type TaskListFilters,
} from './query-keys';

const FILTERS: TaskListFilters = { sort: 'createdAt', dir: 'desc', page: 1, size: 7 };

describe('token-namespaced board keys — cross-board cache isolation (UI-H1/H2)', () => {
  it('two boards never produce equal keys for the same resource + filters', () => {
    expect(boardKeys('A')).not.toEqual(boardKeys('B'));
    expect(boardTaskKeys('A').list(FILTERS)).not.toEqual(boardTaskKeys('B').list(FILTERS));
    expect(boardStatusKeys('A').all).not.toEqual(boardStatusKeys('B').all);
    expect(boardParticipantKeys('A').all).not.toEqual(boardParticipantKeys('B').all);
  });

  it('every board key is prefixed with boardKeys(token) so removeQueries can target one board', () => {
    expect(boardTaskKeys('A').all.slice(0, 2)).toEqual([...boardKeys('A')]);
    expect(boardStatusKeys('A').all.slice(0, 2)).toEqual([...boardKeys('A')]);
    expect(boardParticipantKeys('A').all.slice(0, 2)).toEqual([...boardKeys('A')]);
  });

  it('removeQueries({ queryKey: boardKeys(A) }) wipes only board A — B and the flat surface survive', () => {
    const qc = new QueryClient();

    // Seed caches for board A, board B, and the flat owner surface.
    qc.setQueryData(boardTaskKeys('A').list(FILTERS), { items: ['a-task'] });
    qc.setQueryData(boardStatusKeys('A').all, ['a-status']);
    qc.setQueryData(boardParticipantKeys('A').all, ['a-participant']);
    qc.setQueryData(boardTaskKeys('B').list(FILTERS), { items: ['b-task'] });
    qc.setQueryData(boardParticipantKeys('B').all, ['b-participant']);
    qc.setQueryData(taskKeys.list(FILTERS), { items: ['flat-task'] });

    // The UI-H2 clear: on a server-confirmed !isJoined for board A.
    qc.removeQueries({ queryKey: boardKeys('A') });

    // Board A is gone entirely...
    expect(qc.getQueryData(boardTaskKeys('A').list(FILTERS))).toBeUndefined();
    expect(qc.getQueryData(boardStatusKeys('A').all)).toBeUndefined();
    expect(qc.getQueryData(boardParticipantKeys('A').all)).toBeUndefined();

    // ...while board B and the flat surface are untouched (no A→B leak, owner `/` unaffected).
    expect(qc.getQueryData(boardTaskKeys('B').list(FILTERS))).toEqual({ items: ['b-task'] });
    expect(qc.getQueryData(boardParticipantKeys('B').all)).toEqual(['b-participant']);
    expect(qc.getQueryData(taskKeys.list(FILTERS))).toEqual({ items: ['flat-task'] });

    qc.clear();
  });
});
