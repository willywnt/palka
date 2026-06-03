import { z } from 'zod';

export const mapListingSchema = z.object({
  variantId: z.string().cuid(),
});

export type MapListingInput = z.infer<typeof mapListingSchema>;

export const marketplaceListingParamSchema = z.object({
  id: z.string().cuid(),
  productId: z.string().cuid(),
});

export type MarketplaceListingParam = z.infer<typeof marketplaceListingParamSchema>;
