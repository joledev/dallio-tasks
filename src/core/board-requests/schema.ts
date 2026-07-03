import { z } from 'zod';

// A guest's rename/delete request. RENAME requires a proposedName; DELETE never carries one (the
// server derives everything else — kind/actor — so this is the entire trust-boundary payload).
export const createBoardRequestSchema = z
  .object({
    kind: z.enum(['RENAME', 'DELETE']),
    proposedName: z.string().trim().min(1).max(80).optional(),
  })
  .refine((data) => data.kind !== 'RENAME' || Boolean(data.proposedName), {
    message: 'proposedName is required for a RENAME request',
    path: ['proposedName'],
  });

export type CreateBoardRequestInput = z.infer<typeof createBoardRequestSchema>;

// The owner's approve/reject decision on a pending request.
export const resolveBoardRequestSchema = z.object({
  action: z.enum(['approve', 'reject']),
});

export type ResolveBoardRequestInput = z.infer<typeof resolveBoardRequestSchema>;
