import { describe, expect, it } from 'vitest';
import { extractSameOriginBoardToken } from './qr-token';

const ORIGIN = 'https://dallio.example';

describe('extractSameOriginBoardToken', () => {
  it('returns the token for a same-origin board URL', () => {
    expect(extractSameOriginBoardToken('https://dallio.example/b/abc_123-def', ORIGIN)).toBe(
      'abc_123-def',
    );
  });

  it('returns the token for a relative board path', () => {
    expect(extractSameOriginBoardToken('/b/demo-board-share-token', ORIGIN)).toBe(
      'demo-board-share-token',
    );
  });

  it('rejects foreign origins', () => {
    expect(extractSameOriginBoardToken('https://evil.example/b/abc', ORIGIN)).toBeNull();
  });

  it('returns null for junk', () => {
    expect(extractSameOriginBoardToken('not a board', ORIGIN)).toBeNull();
  });
});
