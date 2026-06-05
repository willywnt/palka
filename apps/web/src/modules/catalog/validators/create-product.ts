import { z } from 'zod';

import { variantBlockSchema, MAX_VARIANT_BLOCKS } from './add-variant';
import { createVariantSchema } from './variant';

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

/**
 * Create a product with zero or more leaf variants. The dialog flattens its
 * variant blocks into `variants` before sending; an empty array creates a
 * product on its own (variants added later from the detail page).
 */
export const createProductSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(200),
  description: optionalTrimmed(2000),
  category: optionalTrimmed(100),
  variants: z.array(createVariantSchema).max(MAX_VARIANT_BLOCKS * 50),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

/** Form-facing schema for the create dialog: product fields + a variant builder. */
export const createProductFormSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(200),
  category: z.string().trim().max(100),
  description: z.string().trim().max(2000),
  variants: z.array(variantBlockSchema).max(MAX_VARIANT_BLOCKS),
});

export type CreateProductFormInput = z.infer<typeof createProductFormSchema>;
