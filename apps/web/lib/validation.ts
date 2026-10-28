import type { ZodType } from 'zod';

export type FieldErrors = Record<string, string>;

/**
 * Run a Zod schema over form values.
 *  - valid   -> { data, errors: null }          (data is the cleaned-up value: trimmed, lowercased...)
 *  - invalid -> { data: null, errors: { field: "first message for that field" } }
 */
export function validate<T>(schema: ZodType<T>, values: unknown) {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data, errors: null };

  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '_');
    errors[field] ??= issue.message; // keep only the first message per field
  }
  return { data: null, errors };
}
