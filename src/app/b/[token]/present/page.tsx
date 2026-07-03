import { notFound } from 'next/navigation';
import { BoardProvider } from '@/app/_components/board-context';
import { boardRepository } from '@/core/boards/container';
import { PresentScreen } from './present-screen';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ token: string }> };

export default async function PresentPage({ params }: Params) {
  const { token } = await params;
  const board = await boardRepository.getByToken(token);
  if (!board) notFound();

  return (
    <BoardProvider
      boardId={board.id}
      token={token}
      initialMode={board.mode}
      participant={{ id: 'projector', displayName: 'Projector', color: 'zinc' }}
      present
    >
      <PresentScreen boardName={board.name} />
    </BoardProvider>
  );
}
