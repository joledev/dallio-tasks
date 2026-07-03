// The acting identity for every board-scoped operation. boardId is the IDOR anchor.
// participantId is the acting participant (null for owner-direct, the interim path before
// guest sessions exist). Frozen so the guest layer can build the same Actor from a cookie.
export type Actor = {
  boardId: string;
  participantId: string | null;
};
