import { z } from 'zod';
import { ok, err, type Result } from '@/core/shared/envelope';

// One helper for every route-boundary parse: a Zod failure becomes a VALIDATION_ERROR envelope
// carrying the flattened field errors; success yields the parsed (output) data.
export function parse<S extends z.ZodType>(
  schema: S,
  input: unknown,
  message: string,
): Result<z.infer<S>> {
  const result = schema.safeParse(input);
  return result.success
    ? ok(result.data)
    : err('VALIDATION_ERROR', message, z.flattenError(result.error));
}

const idSchema = z.uuid();

// Route `:id` params are always uuids — fold the repeated check into one call.
export function parseId(id: string): Result<string> {
  return parse(idSchema, id, 'Invalid id');
}
