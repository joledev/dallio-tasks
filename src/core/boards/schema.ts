import { z } from 'zod';

// Create a board: a name only. The owner is derived server-side (resolveOwnerId); the shareToken is
// minted server-side. Trimmed, 1..80, non-empty after trim.
export const createBoardSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export type CreateBoardInput = z.infer<typeof createBoardSchema>;

// Rename an existing board (owner-direct PATCH, and the payload an approved guest RENAME request
// applies). Same shape/constraints as create — a name only.
export const renameBoardSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export type RenameBoardInput = z.infer<typeof renameBoardSchema>;
