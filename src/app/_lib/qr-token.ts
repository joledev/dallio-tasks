const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

export function extractSameOriginBoardToken(value: string, origin: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed, origin);
  } catch {
    return null;
  }

  if (url.origin !== origin) return null;

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 2 || parts[0] !== 'b') return null;

  const token = decodeURIComponent(parts[1]);
  return TOKEN_PATTERN.test(token) ? token : null;
}
