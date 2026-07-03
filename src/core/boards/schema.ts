import { z } from 'zod';

// Create a board: a name only. The owner is derived server-side (resolveOwnerId); the shareToken is
// minted server-side. Trimmed, 1..80, non-empty after trim.
export const createBoardSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export type CreateBoardInput = z.infer<typeof createBoardSchema>;
