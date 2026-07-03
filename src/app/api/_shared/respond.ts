import { NextResponse } from 'next/server';
import { logger } from '@/core/shared/logger';
import { err, type Result, type ErrorCode } from '@/core/shared/envelope';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  LIMIT_EXCEEDED: 409, // a full board is a conflicting state, not a bad request
  INTERNAL: 500,
};

// Serialize a Result verbatim; the handler only chooses the HTTP status.
export function respond<T>(result: Result<T>, okStatus = 200) {
  const status = result.ok ? okStatus : STATUS[result.error.code];
  return NextResponse.json(result, { status });
}

// Wrap every handler: an unexpected throw becomes a redacted log + generic INTERNAL envelope
// (never leak a stack trace or DB detail to the client).
export async function handle<T>(fn: () => Promise<Result<T>>, okStatus = 200) {
  try {
    return respond(await fn(), okStatus);
  } catch (e) {
    // Log only a scrubbed shape — a raw Prisma error can embed field values (e.g. the offending
    // email) in its message/meta and leak them into the logs. The client sees a generic 500.
    const scrubbed = e as { name?: string; code?: string };
    logger.error({ err: { name: scrubbed?.name, code: scrubbed?.code } }, 'unhandled route error');
    return respond(err('INTERNAL', 'Internal error'), 500);
  }
}

// UI-H3 — mark a response uncacheable. A guest board lives at a stable, cookie-authorized URL, so a
// browser/proxy/CDN could otherwise serve one visitor's board data to a pre-join request. Applied to
// EVERY `/api/b/[token]/*` response (success and error alike).
export function noStore<R extends { headers: Headers }>(res: R): R {
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

// The guest response path: wrap a handler exactly like `handle()`, then stamp `Cache-Control: no-store`
// on whatever it returns (INTERNAL 500 included). Every guest route uses this instead of `handle()`.
export async function handleGuest<T>(fn: () => Promise<Result<T>>, okStatus = 200) {
  return noStore(await handle(fn, okStatus));
}
