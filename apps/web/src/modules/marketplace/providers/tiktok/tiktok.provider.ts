import 'server-only';

import { MarketplaceProvider } from '@prisma/client';

import { BaseMarketplaceProviderAdapter } from '../base.provider';

/** TikTok Shop adapter — placeholder for future integration. */
export class TikTokMarketplaceProvider extends BaseMarketplaceProviderAdapter {
  readonly provider = MarketplaceProvider.TIKTOK;
}

export const tiktokMarketplaceProvider = new TikTokMarketplaceProvider();
