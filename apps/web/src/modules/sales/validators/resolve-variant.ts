import { z } from 'zod';

/** A scanned code (barcode or SKU) to resolve to a single sellable variant for the POS cart. */
export const resolveVariantQuerySchema = z.object({
  code: z.string().trim().min(1).max(64),
});

export type ResolveVariantQuery = z.infer<typeof resolveVariantQuerySchema>;
