import { z } from 'zod';

/** Decimal(12,2) caps the storable money value just under 10^10. */
const MAX_MONEY = 9_999_999_999;

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

/**
 * Patch a live variant's core fields (name/group/barcode/price/cost). Used by the
 * bulk CSV import to update existing SKUs; SKU itself is the match key and is NOT
 * editable here. Every field is optional — an omitted field is left UNCHANGED (so
 * a bulk price update never clobbers an existing barcode/cost). Clearing a field
 * stays a UI concern.
 */
export const updateVariantDetailsSchema = z.object({
  name: z.string().trim().min(1, 'Variant name is required').max(200).optional(),
  variantGroup: optionalTrimmed(200),
  barcode: optionalTrimmed(64),
  price: z.coerce.number().nonnegative('Price must be 0 or more').max(MAX_MONEY).optional(),
  cost: z.coerce.number().nonnegative().max(MAX_MONEY).optional(),
});

export type UpdateVariantDetailsInput = z.infer<typeof updateVariantDetailsSchema>;
