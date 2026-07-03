import { createHash, randomBytes } from 'node:crypto';

// Guest-session crypto (design B — opaque token, no shared secret). The raw token lives only in the
// httpOnly cookie; the DB stores its sha256 so a leaked `sessionTokenHash` is not a forgeable cookie.

// 256-bit URL-safe opaque token. base64url has no '+', '/', '=' so it is cookie-safe as-is.
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

// Hex sha256 — the value persisted in Participant.sessionTokenHash and the lookup key in resolveActor.
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// Fresh, unguessable board shareToken (128-bit hex, URL-safe) minted when an owner creates a board.
export function generateShareToken(): string {
  return randomBytes(16).toString('hex');
}
