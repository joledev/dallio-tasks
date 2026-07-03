import { z } from 'zod';

// Closed palette (D6): color is a TOKEN, never a free-form hex. null → neutral (zinc) at render.
export const STATUS_COLORS = ['zinc', 'blue', 'green', 'amber', 'red', 'violet', 'rose'] as const;
export const StatusColorEnum = z.enum(STATUS_COLORS);

// Create: name only; slug is server-derived (dedupe key), position server-appended, isDefault never
// set on create. ZERO server imports — shared by client forms and server handlers.
export const createStatusSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: StatusColorEnum.optional(),
});

export type CreateStatusInput = z.infer<typeof createStatusSchema>;
export type StatusColor = z.infer<typeof StatusColorEnum>;

// slug derivation (shared, pure): lowercase, spaces/dashes → "_", strip non-alnum/underscore, trim "_".
export const slugifyStatus = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '');
