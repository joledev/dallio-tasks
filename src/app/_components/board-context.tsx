'use client';

import { createContext, useContext, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { boardKeys } from '@/app/_lib/query-keys';
import { useBoardStream } from '@/app/_hooks/use-board-stream';
import type { GuestParticipantDTO } from '@/app/_lib/types';

// The guest board seam. Every board-scoped data hook reads `token` from here, so no component hardcodes
// a path and the flat owner `/` surface (no provider) keeps its own flat data layer untouched.
//
// `isJoined` is derived from the SERVER-provided `participant` (UI-H5): the server component re-runs
// `resolveActor` on the httpOnly cookie and passes down `participant | null`. A forged client value can
// never flip this to `true` in a way that authorizes anything — the API re-checks the cookie on every
// call; this flag is UX gating only (which screen to render).
export type BoardContextValue = {
  boardId: string;
  token: string;
  initialMode: 'DIRECT' | 'VOTE';
  participant: GuestParticipantDTO | null;
  isJoined: boolean;
  present?: boolean;
};

const BoardContext = createContext<BoardContextValue | null>(null);

// Optional read: returns null on the flat `/` surface (no provider). Used by the shared data hooks so
// they can branch to the flat data layer when there is no board in scope.
export function useOptionalBoard(): BoardContextValue | null {
  return useContext(BoardContext);
}

// Required read: throws if used outside a BoardProvider (a programming error in the board subtree).
export function useBoard(): BoardContextValue {
  const value = useContext(BoardContext);
  if (!value) throw new Error('useBoard must be used within a BoardProvider');
  return value;
}

export function BoardProvider({
  boardId,
  token,
  initialMode,
  participant,
  present = false,
  children,
}: {
  boardId: string;
  token: string;
  initialMode: 'DIRECT' | 'VOTE';
  participant: GuestParticipantDTO | null;
  present?: boolean;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const isJoined = participant !== null;

  const value = useMemo<BoardContextValue>(
    () => ({ boardId, token, initialMode, participant, isJoined, present }),
    [boardId, token, initialMode, participant, isJoined, present],
  );

  // UI-H2 — on a server-confirmed `!isJoined` (pre-join, expiry, cookie deletion, or an A→B navigation
  // that lands on a board this visitor hasn't joined), drop everything cached under this token so no
  // board data lingers behind the JoinDialog. Scoped to `boardKeys(token)`, so a sibling board's cache
  // in another tab is never touched.
  useEffect(() => {
    if (!isJoined) queryClient.removeQueries({ queryKey: boardKeys(token) });
  }, [isJoined, token, queryClient]);

  useBoardStream(token, isJoined, present);

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}
