import { z } from 'zod';

/**
 * Per-connection config update. `syncWarehouseCode` designates the ONE Lazada warehouse Falka
 * owns (stock push targets only it); an empty/whitespace value clears it back to the
 * single-warehouse bare path. Tokens/secrets are NOT editable here.
 */
export const updateConnectionSchema = z.object({
  syncWarehouseCode: z
    .string()
    .trim()
    .max(64)
    .nullable()
    .transform((value) => (value && value.length > 0 ? value : null)),
});

export type UpdateMarketplaceConnectionInput = z.infer<typeof updateConnectionSchema>;
