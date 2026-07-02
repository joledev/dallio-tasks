import { err, type Result } from '@/core/shared/envelope';

// Fase 1: the seeded single owner. The auth bonus replaces this body with JWT/session extraction —
// nothing else in the app changes (identity is always derived here, never from the request body).
export function resolveActingUserId(): Result<string> {
  const id = process.env.SEED_OWNER_ID;
  return id ? { ok: true, data: id } : err('UNAUTHORIZED', 'No acting user');
}
