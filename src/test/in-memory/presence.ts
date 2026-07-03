import {
  PRESENCE_STALE_MS,
  type PresenceSnapshot,
  type PresenceStore,
} from '@/core/realtime/presence';

export class InMemoryPresenceStore implements PresenceStore {
  private readonly scores = new Map<string, Map<string, number>>();
  private readonly conns = new Map<string, number>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async join(boardId: string, participantId: string): Promise<boolean> {
    const key = this.connKey(boardId, participantId);
    const count = (this.conns.get(key) ?? 0) + 1;
    this.conns.set(key, count);
    this.setScore(boardId, participantId, this.now());
    return count === 1;
  }

  async touch(boardId: string, participantId: string): Promise<void> {
    this.setScore(boardId, participantId, this.now());
  }

  async leave(boardId: string, participantId: string): Promise<boolean> {
    const key = this.connKey(boardId, participantId);
    const count = (this.conns.get(key) ?? 0) - 1;
    if (count > 0) {
      this.conns.set(key, count);
      return false;
    }
    this.conns.delete(key);
    this.scores.get(boardId)?.delete(participantId);
    return true;
  }

  async online(boardId: string): Promise<PresenceSnapshot> {
    const staleBefore = this.now() - PRESENCE_STALE_MS;
    const board = this.scores.get(boardId) ?? new Map<string, number>();
    const participantIds: string[] = [];
    for (const [participantId, score] of board) {
      if (score > staleBefore) participantIds.push(participantId);
      else board.delete(participantId);
    }
    return { participantIds, onlineCount: participantIds.length };
  }

  setLastSeen(boardId: string, participantId: string, lastSeen: number) {
    this.setScore(boardId, participantId, lastSeen);
  }

  connectionCount(boardId: string, participantId: string): number {
    return this.conns.get(this.connKey(boardId, participantId)) ?? 0;
  }

  private setScore(boardId: string, participantId: string, score: number) {
    const board = this.scores.get(boardId) ?? new Map<string, number>();
    board.set(participantId, score);
    this.scores.set(boardId, board);
  }

  private connKey(boardId: string, participantId: string) {
    return `${boardId}:${participantId}`;
  }
}
