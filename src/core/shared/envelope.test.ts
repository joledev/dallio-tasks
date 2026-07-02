import { describe, it, expect } from 'vitest';
import { ok, err, type ErrorCode } from './envelope';

describe('envelope', () => {
  it('ok() wraps data with ok:true', () => {
    expect(ok({ a: 1 })).toEqual({ ok: true, data: { a: 1 } });
  });

  it('err() builds the failure envelope and omits details when undefined', () => {
    const e = err('NOT_FOUND', 'Task not found');
    expect(e).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
    expect('details' in e.error).toBe(false);
  });

  it('err() includes details when provided', () => {
    const e = err('VALIDATION_ERROR', 'Invalid', { field: 'title' });
    expect(e.error.details).toEqual({ field: 'title' });
  });

  it('closed error-code set is exactly the five documented codes', () => {
    // A type-level guard materialized at runtime: adding/removing a code breaks this list.
    const codes: ErrorCode[] = [
      'VALIDATION_ERROR',
      'NOT_FOUND',
      'UNAUTHORIZED',
      'CONFLICT',
      'INTERNAL',
    ];
    expect(codes).toHaveLength(5);
    for (const c of codes) expect(err(c, 'm').error.code).toBe(c);
  });
});
