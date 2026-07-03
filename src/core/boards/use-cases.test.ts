import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryBoardRepository } from '@/test/in-memory/board-repository';
import { InMemoryStatusRepository } from '@/test/in-memory/status-repository';
import type { Board } from './board';
import { listBoards, createBoard } from './use-cases';
import { createBoardSchema } from './schema';

const OWNER_A = '00000000-0000-4000-8000-00000000000a';
const OWNER_B = '00000000-0000-4000-8000-00000000000b';

const board = (id: string, ownerId: string, name: string): Board => ({
  id,
  ownerId,
  name,
  shareToken: `tok-${id}`,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('listBoards — owner-scoped', () => {
  it('returns only the acting owner’s boards', async () => {
    const repo = new InMemoryBoardRepository([
      board('b1', OWNER_A, 'A-1'),
      board('b2', OWNER_A, 'A-2'),
      board('b3', OWNER_B, 'B-1'),
    ]);
    const res = await listBoards(repo, OWNER_A);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.map((b) => b.name).sort()).toEqual(['A-1', 'A-2']);
    expect(res.data.every((b) => b.ownerId === OWNER_A)).toBe(true);
  });
});

describe('createBoard — seeds default statuses on the new board', () => {
  let statusRepo: InMemoryStatusRepository;
  let boardRepo: InMemoryBoardRepository;

  beforeEach(() => {
    statusRepo = new InMemoryStatusRepository();
    boardRepo = new InMemoryBoardRepository([], statusRepo);
  });

  it('creates the board for the owner with a fresh shareToken', async () => {
    const res = await createBoard(boardRepo, OWNER_A, createBoardSchema.parse({ name: 'Launch' }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.ownerId).toBe(OWNER_A);
    expect(res.data.name).toBe('Launch');
    expect(res.data.shareToken).toMatch(/^[0-9a-f]{32}$/); // 128-bit hex
  });

  it('seeds the canonical default statuses (todo default, in_progress, done)', async () => {
    const res = await createBoard(boardRepo, OWNER_A, createBoardSchema.parse({ name: 'Launch' }));
    if (!res.ok) throw new Error('expected ok');
    const statuses = await statusRepo.list(res.data.id);
    expect(statuses.map((s) => s.slug)).toEqual(['todo', 'in_progress', 'done']);
    const def = statuses.filter((s) => s.isDefault);
    expect(def).toHaveLength(1);
    expect(def[0].slug).toBe('todo');
  });

  it('scopes the seeded statuses to the new board only', async () => {
    const a = await createBoard(boardRepo, OWNER_A, createBoardSchema.parse({ name: 'A' }));
    const b = await createBoard(boardRepo, OWNER_B, createBoardSchema.parse({ name: 'B' }));
    if (!a.ok || !b.ok) throw new Error('expected ok');
    expect((await statusRepo.list(a.data.id)).every((s) => s.boardId === a.data.id)).toBe(true);
    expect(await statusRepo.list(b.data.id)).toHaveLength(3);
  });
});
