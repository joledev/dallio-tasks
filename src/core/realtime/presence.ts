export const PRESENCE_STALE_MS = 45_000;

export type PresenceSnapshot = {
  participantIds: string[];
  onlineCount: number;
};

export interface PresenceStore {
  join(boardId: string, participantId: string): Promise<boolean>;
  touch(boardId: string, participantId: string): Promise<void>;
  leave(boardId: string, participantId: string): Promise<boolean>;
  online(boardId: string): Promise<PresenceSnapshot>;
}
