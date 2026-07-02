import { describe, it, expect } from 'vitest';
import pino from 'pino';
import { REDACT_PATHS } from './logger';

// The exported `logger` writes to fd 1 via sonic-boom, which bypasses spy-able JS streams, so we
// rebuild a pino logger with the same redact config piped to an in-memory sink to assert the contract.
function capture(): { logger: pino.Logger; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const sink = { write: (s: string) => chunks.push(s) };
  const logger = pino(
    { level: 'info', redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } },
    sink as unknown as import('node:stream').Writable,
  );
  return { logger, lines: () => chunks.map((c) => JSON.parse(c)) };
}

describe('logger redaction', () => {
  it('redacts top-level secret keys', () => {
    const { logger, lines } = capture();
    logger.info(
      { password: 'hunter2', token: 'jwt.abc', DATABASE_URL: 'postgres://u:p@h/db' },
      'x',
    );
    const rec = lines()[0];
    expect(rec.password).toBe('[REDACTED]');
    expect(rec.token).toBe('[REDACTED]');
    expect(rec.DATABASE_URL).toBe('[REDACTED]');
  });

  it('redacts nested passwordHash and request auth/cookie headers', () => {
    const { logger, lines } = capture();
    logger.info(
      {
        user: { passwordHash: 'argon2id$leak', password: 'p' },
        req: { headers: { authorization: 'Bearer secret', cookie: 'sid=1' } },
      },
      'x',
    );
    const rec = lines()[0] as Record<string, Record<string, unknown>>;
    expect(rec.user.passwordHash).toBe('[REDACTED]');
    expect(rec.user.password).toBe('[REDACTED]');
    expect((rec.req.headers as Record<string, unknown>).authorization).toBe('[REDACTED]');
    expect((rec.req.headers as Record<string, unknown>).cookie).toBe('[REDACTED]');
  });

  it('leaves non-secret fields intact', () => {
    const { logger, lines } = capture();
    logger.info({ email: 'a@b.io', taskId: '123' }, 'x');
    const rec = lines()[0];
    expect(rec.email).toBe('a@b.io');
    expect(rec.taskId).toBe('123');
  });
});
