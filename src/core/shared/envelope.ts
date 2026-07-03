export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'LIMIT_EXCEEDED'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export type Ok<T> = { ok: true; data: T };
export type Err = { ok: false; error: { code: ErrorCode; message: string; details?: unknown } };
export type Result<T> = Ok<T> | Err;

export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });

export const err = (code: ErrorCode, message: string, details?: unknown): Err => ({
  ok: false,
  error: { code, message, ...(details !== undefined ? { details } : {}) },
});
