import { describe, it, expect } from 'vitest';
import { respond, handle, handleGuest } from './respond';
import { ok, err, type ErrorCode } from '@/core/shared/envelope';

describe('respond — Result → HTTP status', () => {
  it('maps ok to the provided okStatus and serializes the envelope', async () => {
    const res = respond(ok({ id: '1' }), 201);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, data: { id: '1' } });
  });

  it.each<[ErrorCode, number]>([
    ['VALIDATION_ERROR', 400],
    ['UNAUTHORIZED', 401],
    ['NOT_FOUND', 404],
    ['CONFLICT', 409],
    ['INTERNAL', 500],
  ])('maps %s → %d', (code, status) => {
    const res = respond(err(code, 'm'));
    expect(res.status).toBe(status);
  });
});

describe('handle — unexpected throw is contained', () => {
  it('turns an unhandled throw into a generic INTERNAL 500 (no leak)', async () => {
    const res = await handle(async () => {
      throw new Error('boom: secret db string postgres://u:p@h/db');
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: { code: 'INTERNAL', message: 'Internal error' } });
    // The thrown message (and any DB detail) must NOT reach the client body.
    expect(JSON.stringify(body)).not.toContain('postgres://');
  });

  it('passes a successful Result through with its okStatus', async () => {
    const res = await handle(async () => ok('done'), 201);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, data: 'done' });
  });
});

describe('handleGuest — UI-H3 no-store on the guest response path', () => {
  it('stamps Cache-Control: no-store on a successful guest response (e.g. a GET)', async () => {
    const res = await handleGuest(async () => ok({ items: [] }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: true, data: { items: [] } });
  });

  it('stamps no-store on an error response too (e.g. pre-join UNAUTHORIZED)', async () => {
    const res = await handleGuest(async () => err('UNAUTHORIZED', 'Not joined'));
    expect(res.status).toBe(401);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('stamps no-store even on a contained internal error', async () => {
    const res = await handleGuest(async () => {
      throw new Error('boom');
    });
    expect(res.status).toBe(500);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
