import { z } from 'zod';

// Join payload: a display name only. Trimmed, 1..40, non-empty after trim. Identity (the opaque
// token) is minted server-side — never accepted from the body.
export const joinBoardSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
});

export type JoinBoardInput = z.infer<typeof joinBoardSchema>;
