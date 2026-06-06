import { MarketplaceProvider } from '@prisma/client';

export const SUPPORTED_MARKETPLACE_PROVIDERS = [
  MarketplaceProvider.SHOPEE,
  MarketplaceProvider.TOKOPEDIA,
  MarketplaceProvider.LAZADA,
] as const;
