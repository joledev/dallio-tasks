import { describe, expect, it } from 'vitest';
import { pageOffset } from './pagination';

describe('pageOffset', () => {
  it('returns 0 for the first page', () => {
    expect(pageOffset(1, 20)).toBe(0);
  });

  it('offsets by a full page for the second page', () => {
    expect(pageOffset(2, 20)).toBe(20);
  });

  it('scales with page size', () => {
    expect(pageOffset(3, 50)).toBe(100);
  });
});
