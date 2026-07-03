import pino from 'pino';

// Keep request/response bodies out of the logs by default; only the redacted shape below is safe.
// H6 (L1b-guest): the guest-session secrets — sessionTokenHash, the opaque cookie (both the
// `__Host-` prod name and the dev `dallio_pid` fallback), the raw join token, and any Set-Cookie
// response header — are redacted at every nesting level the body/headers can surface them.
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'res.headers["Set-Cookie"]',
  '*["set-cookie"]',
  '*["Set-Cookie"]',
  'password',
  'passwordHash',
  'token',
  'sessionTokenHash',
  'dallio_pid',
  '["__Host-dallio_pid"]',
  'DATABASE_URL',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.sessionTokenHash',
  '*.dallio_pid',
  '*["__Host-dallio_pid"]',
  '*.DATABASE_URL',
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
});
