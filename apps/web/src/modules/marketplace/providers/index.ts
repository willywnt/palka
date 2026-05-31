import 'server-only';

import type { MarketplaceProvider } from '@prisma/client';

import type { MarketplaceProviderAdapter } from '../domain/marketplace-provider.interface';
import { lazadaMarketplaceProvider } from './lazada/lazada.provider';
import { shopeeMarketplaceProvider } from './shopee/shopee.provider';
import { tiktokMarketplaceProvider } from './tiktok/tiktok.provider';
import { tokopediaMarketplaceProvider } from './tokopedia/tokopedia.provider';

export const MARKETPLACE_PROVIDER_ADAPTERS: Record<
  MarketplaceProvider,
  MarketplaceProviderAdapter
> = {
  SHOPEE: shopeeMarketplaceProvider,
  TOKOPEDIA: tokopediaMarketplaceProvider,
  TIKTOK: tiktokMarketplaceProvider,
  LAZADA: lazadaMarketplaceProvider,
};

export function getMarketplaceProviderAdapter(
  provider: MarketplaceProvider,
): MarketplaceProviderAdapter {
  return MARKETPLACE_PROVIDER_ADAPTERS[provider];
}

export { shopeeMarketplaceProvider } from './shopee/shopee.provider';
export { tokopediaMarketplaceProvider } from './tokopedia/tokopedia.provider';
export { tiktokMarketplaceProvider } from './tiktok/tiktok.provider';
export { lazadaMarketplaceProvider } from './lazada/lazada.provider';
