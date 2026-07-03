import { err, ok, type Result } from '@/core/shared/envelope';

// H4 — `__Host-` cookie prefix. In production the cookie MUST be `__Host-dallio_pid` with Secure,
// Path=/, no Domain, HttpOnly, SameSite=Lax. The `__Host-` prefix makes the browser reject any set
// that isn't host-only + secure + path-root (kills cookie-tossing / subdomain fixation). In local dev
// (http://) a `__Host-`/Secure cookie won't set, so we fall back to a plain `dallio_pid` (Secure off).
const PROD_COOKIE_NAME = '__Host-dallio_pid';
const DEV_COOKIE_NAME = 'dallio_pid';

const isProd = () => process.env.NODE_ENV === 'production';

export function guestCookieName(): string {
  return isProd() ? PROD_COOKIE_NAME : DEV_COOKIE_NAME;
}

// ~30 days.
const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export type GuestCookie = {
  name: string;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
};

// The Set-Cookie spec for the opaque guest token. Never readable by JS (httpOnly); `secure` and the
// `__Host-` name are gated on production so dev over http still works.
export function guestCookie(token: string): GuestCookie {
  return {
    name: guestCookieName(),
    value: token,
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    path: '/',
    maxAge: GUEST_COOKIE_MAX_AGE,
    // NB: intentionally NO `domain` — `__Host-` requires host-only.
  };
}

// H5 — CSRF defense-in-depth for guest mutations (/api/b/[token]/* writes + /join). SameSite=Lax is the
// baseline; this is the belt:
//   - reject if `Sec-Fetch-Site` is present and cross-site (or `Origin` present and not same-origin);
//   - require `Content-Type: application/json` (blocks simple/form cross-site POSTs).
// GET is never state-changing on guest routes, so this guard runs only on POST/PATCH/DELETE handlers.
export function guestCsrfCheck(req: Request): Result<null> {
  const secFetchSite = req.headers.get('sec-fetch-site');
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return err('FORBIDDEN', 'Cross-site request rejected');
  }

  const origin = req.headers.get('origin');
  if (origin) {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(origin).origin === new URL(req.url).origin;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) return err('FORBIDDEN', 'Cross-origin request rejected');
  }

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return err('VALIDATION_ERROR', 'Content-Type must be application/json');
  }

  return ok(null);
}
