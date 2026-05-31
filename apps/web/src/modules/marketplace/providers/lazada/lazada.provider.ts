import 'server-only';

import { MarketplaceProvider } from '@prisma/client';

import { BaseMarketplaceProviderAdapter } from '../base.provider';

/** Lazada Open Platform adapter — placeholder for future integration. */
export class LazadaMarketplaceProvider extends BaseMarketplaceProviderAdapter {
  readonly provider = MarketplaceProvider.LAZADA;
}

export const lazadaMarketplaceProvider = new LazadaMarketplaceProvider();
