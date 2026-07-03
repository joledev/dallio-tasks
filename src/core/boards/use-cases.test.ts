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
  mode: 'DIRECT',
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('listBoards — owner-scoped', () => {
  it('returns only the acting owner’s boards (public projection: no id/ownerId on the wire)', async () => {
    const repo = new InMemoryBoardRepository([
      board('b1', OWNER_A, 'A-1'),
      board('b2', OWNER_A, 'A-2'),
      board('b3', OWNER_B, 'B-1'),
    ]);
    const res = await listBoards(repo, OWNER_A);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // owner-scoping: only A's two boards come back (B-1 is excluded)
    expect(res.data.map((b) => b.name).sort()).toEqual(['A-1', 'A-2']);
    // the projection never carries the internal id / ownerId
    expect(res.data.every((b) => !('id' in b) && !('ownerId' in b))).toBe(true);
    expect(res.data.map((b) => b.shareToken).sort()).toEqual(['tok-b1', 'tok-b2']);
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
    expect(res.data.name).toBe('Launch');
    expect(res.data.shareToken).toMatch(/^[0-9a-f]{32}$/); // 128-bit hex
    // owner-scoping verified server-side (not exposed on the wire): the stored board is owned by A
    const stored = await boardRepo.getByToken(res.data.shareToken);
    expect(stored?.ownerId).toBe(OWNER_A);
  });

  it('seeds the canonical default statuses (todo default, in_progress, done)', async () => {
    const res = await createBoard(boardRepo, OWNER_A, createBoardSchema.parse({ name: 'Launch' }));
    if (!res.ok) throw new Error('expected ok');
    const stored = await boardRepo.getByToken(res.data.shareToken);
    const statuses = await statusRepo.list(stored!.id);
    expect(statuses.map((s) => s.slug)).toEqual(['todo', 'in_progress', 'done']);
    const def = statuses.filter((s) => s.isDefault);
    expect(def).toHaveLength(1);
    expect(def[0].slug).toBe('todo');
  });

  it('scopes the seeded statuses to the new board only', async () => {
    const a = await createBoard(boardRepo, OWNER_A, createBoardSchema.parse({ name: 'A' }));
    const b = await createBoard(boardRepo, OWNER_B, createBoardSchema.parse({ name: 'B' }));
    if (!a.ok || !b.ok) throw new Error('expected ok');
    const aId = (await boardRepo.getByToken(a.data.shareToken))!.id;
    const bId = (await boardRepo.getByToken(b.data.shareToken))!.id;
    expect((await statusRepo.list(aId)).every((s) => s.boardId === aId)).toBe(true);
    expect(await statusRepo.list(bId)).toHaveLength(3);
  });
});
