// Fase 2 guest identity. A Participant belongs to exactly one Board (boardId is the tenant anchor).
// sessionTokenHash is the sha256 of the opaque guest-session cookie (design B — never the raw token).
export type Participant = {
  id: string;
  boardId: string;
  displayName: string;
  color: string | null;
  sessionTokenHash: string | null;
  joinedAt: Date;
  lastSeenAt: Date;
};

// Wire projection: drops sessionTokenHash (a secret the client must never receive) so a Participant
// can be safely embedded in a response body. Presence/activity may expose id + displayName + color.
export type PublicParticipant = Pick<Participant, 'id' | 'boardId' | 'displayName' | 'color'>;

export const toPublicParticipant = (p: Participant): PublicParticipant => ({
  id: p.id,
  boardId: p.boardId,
  displayName: p.displayName,
  color: p.color,
});
