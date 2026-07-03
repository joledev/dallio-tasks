import { describe, it, expect } from 'vitest';
import { guestCsrfCheck } from './guest';

const URL = 'https://dallio.example/api/b/tok/tasks';

// Build a mutation Request with the given headers (JSON content-type unless overridden).
function req(headers: Record<string, string>): Request {
  return new Request(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('guestCsrfCheck (H5)', () => {
  it('both Origin and Sec-Fetch-Site absent → FORBIDDEN (no header-less bypass)', () => {
    const res = guestCsrfCheck(req({}));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('FORBIDDEN');
  });

  it('Sec-Fetch-Site: none → allowed', () => {
    const res = guestCsrfCheck(req({ 'sec-fetch-site': 'none' }));
    expect(res.ok).toBe(true);
  });

  it('Sec-Fetch-Site: same-origin → allowed', () => {
    const res = guestCsrfCheck(req({ 'sec-fetch-site': 'same-origin' }));
    expect(res.ok).toBe(true);
  });

  it('same-origin Origin (no Sec-Fetch-Site) → allowed', () => {
    const res = guestCsrfCheck(req({ origin: 'https://dallio.example' }));
    expect(res.ok).toBe(true);
  });

  it('Sec-Fetch-Site: cross-site → FORBIDDEN', () => {
    const res = guestCsrfCheck(req({ 'sec-fetch-site': 'cross-site' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('FORBIDDEN');
  });

  it('cross-origin Origin → FORBIDDEN', () => {
    const res = guestCsrfCheck(req({ origin: 'https://evil.example' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('FORBIDDEN');
  });

  it('same-origin but non-JSON content-type → VALIDATION_ERROR', () => {
    const res = guestCsrfCheck(
      new Request(URL, {
        method: 'POST',
        headers: { 'sec-fetch-site': 'same-origin', 'content-type': 'text/plain' },
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('VALIDATION_ERROR');
  });

  it('missing content-type entirely → VALIDATION_ERROR (positive origin present)', () => {
    const res = guestCsrfCheck(
      new Request(URL, { method: 'POST', headers: { origin: 'https://dallio.example' } }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('VALIDATION_ERROR');
  });

  // Regression: behind a TLS-terminating proxy the request lands as internal http, but the browser's
  // Origin is https + the public host arrives via X-Forwarded-Host. Same-origin must be accepted.
  it('proxied same-origin (https Origin, internal http req.url, X-Forwarded-Host) → allowed', () => {
    const res = guestCsrfCheck(
      new Request('http://10.42.0.9:3000/api/b/tok/join', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://dallio.example',
          'x-forwarded-host': 'dallio.example',
          'sec-fetch-site': 'same-origin',
        },
      }),
    );
    expect(res.ok).toBe(true);
  });

  it('proxied cross-origin (foreign Origin, X-Forwarded-Host is our host) → FORBIDDEN', () => {
    const res = guestCsrfCheck(
      new Request('http://10.42.0.9:3000/api/b/tok/join', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://evil.example',
          'x-forwarded-host': 'dallio.example',
        },
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('FORBIDDEN');
  });
});
