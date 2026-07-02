import pino from 'pino';

// Keep request/response bodies out of the logs by default; only the redacted shape below is safe.
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  'passwordHash',
  'token',
  'DATABASE_URL',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.DATABASE_URL',
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
});
