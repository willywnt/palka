import { z } from 'zod';

export const marketplaceAccountIdSchema = z.object({
  id: z.string().cuid(),
});

export type MarketplaceAccountIdInput = z.infer<typeof marketplaceAccountIdSchema>;

/** @deprecated Use marketplaceAccountIdSchema */
export const marketplaceConnectionIdSchema = marketplaceAccountIdSchema;
export type MarketplaceConnectionIdInput = MarketplaceAccountIdInput;
