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

// UI-H4 — the guest-facing projection for `GET /api/b/[token]/participants`. It drops BOTH the secret
// `sessionTokenHash` AND `boardId`: a joined guest already knows which board they are on (it is the URL
// token), and leaking the internal board UUID onto every participant is needless surface. This is the
// ONLY shape the participants list endpoint returns — never `PublicParticipant` (which carries boardId).
export type GuestParticipant = Pick<Participant, 'id' | 'displayName' | 'color'>;

export const toGuestParticipant = (p: Participant): GuestParticipant => ({
  id: p.id,
  displayName: p.displayName,
  color: p.color,
});
