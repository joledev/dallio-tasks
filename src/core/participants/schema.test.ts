import { describe, it, expect } from 'vitest';
import { joinBoardSchema } from './schema';

// The JoinDialog validates with this exact schema (via zodResolver), so these cases are the dialog's
// client-side validation contract as well as the server's. displayName: trimmed, non-empty, 1..40.
describe('joinBoardSchema — the JoinDialog validation contract', () => {
  it('accepts a normal name and trims surrounding whitespace', () => {
    const res = joinBoardSchema.safeParse({ displayName: '  Grace  ' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.displayName).toBe('Grace');
  });

  it('rejects an empty string', () => {
    expect(joinBoardSchema.safeParse({ displayName: '' }).success).toBe(false);
  });

  it('rejects whitespace-only (empty after trim)', () => {
    expect(joinBoardSchema.safeParse({ displayName: '   ' }).success).toBe(false);
  });

  it('rejects a missing displayName', () => {
    expect(joinBoardSchema.safeParse({}).success).toBe(false);
  });

  it('accepts exactly 40 characters', () => {
    expect(joinBoardSchema.safeParse({ displayName: 'a'.repeat(40) }).success).toBe(true);
  });

  it('rejects 41 characters', () => {
    expect(joinBoardSchema.safeParse({ displayName: 'a'.repeat(41) }).success).toBe(false);
  });
});
