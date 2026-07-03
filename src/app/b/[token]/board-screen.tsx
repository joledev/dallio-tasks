'use client';

import { Suspense } from 'react';
import { LoadingState } from '@/app/_components/states';
import { useBoard } from '@/app/_components/board-context';
import { BoardView } from './board-view';
import { JoinDialog } from './join-dialog';

// The client shell for `/b/[token]`. Gating rules:
//  - UI-H2: the board data subtree (BoardView) mounts ONLY when the server-confirmed participant exists.
//    Pre-join, we render just the JoinDialog — no board query is created, nothing to leak behind it.
//  - UI-H1: BoardView is keyed by `token`, so navigating `/b/A → /b/B` remounts it from scratch (board
//    A's tasks can never flash under board B while B loads).
//  - `useSearchParams()` (via the filter hooks) requires a Suspense boundary, mirroring the flat `/`.
export function BoardScreen({ boardName }: { boardName: string }) {
  const { token, isJoined } = useBoard();

  return (
    <main className="flex-1">
      {isJoined ? (
        <Suspense fallback={<LoadingState rows={8} className="mx-auto max-w-6xl px-4 py-8" />}>
          <BoardView key={token} boardName={boardName} />
        </Suspense>
      ) : null}
      <JoinDialog boardName={boardName} />
    </main>
  );
}
