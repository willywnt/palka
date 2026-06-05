import { z } from 'zod';

/** A product may declare at most this many option dimensions (e.g. Model, Warna). */
export const MAX_OPTION_TYPES = 4;
const OPTION_NAME_MAX = 40;
const OPTION_VALUE_MAX = 60;

/** One resolved option value on a variant, keyed to a product option dimension. */
export const variantOptionSchema = z.object({
  name: z.string().trim().min(1, 'Option name is required').max(OPTION_NAME_MAX),
  value: z.string().trim().min(1, 'Option value is required').max(OPTION_VALUE_MAX),
});

export type VariantOption = z.infer<typeof variantOptionSchema>;

/** The full options array a variant carries; empty = a plain variant. */
export const variantOptionsSchema = z.array(variantOptionSchema).max(MAX_OPTION_TYPES);

/** A product's ordered option dimension names; empty = a simple product. */
export const optionTypesSchema = z
  .array(z.string().trim().min(1, 'Option name is required').max(OPTION_NAME_MAX))
  .max(MAX_OPTION_TYPES);

/**
 * Parse a persisted `ProductVariant.options` JSON value into a typed array.
 * Returns `[]` for null/legacy/invalid shapes so the read path never throws.
 */
export function parseVariantOptions(value: unknown): VariantOption[] {
  const result = variantOptionsSchema.safeParse(value);
  return result.success ? result.data : [];
}

/**
 * Parse a persisted `Product.optionTypes` JSON value into a typed array.
 * Returns `[]` for null/legacy/invalid shapes so the read path never throws.
 */
export function parseOptionTypes(value: unknown): string[] {
  const result = optionTypesSchema.safeParse(value);
  return result.success ? result.data : [];
}
