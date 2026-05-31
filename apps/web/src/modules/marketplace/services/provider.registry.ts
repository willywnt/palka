import type { MarketplaceProvider } from '@prisma/client';

import type { MarketplaceProviderCapabilities } from '../types';
import { SUPPORTED_MARKETPLACE_PROVIDERS } from '../utils/providers';

/** Provider-ready registry for future OAuth, refresh, and sync integrations. */
export const MARKETPLACE_PROVIDER_REGISTRY: Record<
  MarketplaceProvider,
  MarketplaceProviderCapabilities
> = {
  SHOPEE: {
    supportsOAuth: true,
    supportsRefresh: true,
    supportsWebhooks: true,
    connectable: true,
  },
  TOKOPEDIA: {
    supportsOAuth: true,
    supportsRefresh: true,
    supportsWebhooks: true,
    connectable: true,
  },
  TIKTOK: {
    supportsOAuth: true,
    supportsRefresh: true,
    supportsWebhooks: true,
    connectable: false,
  },
  LAZADA: {
    supportsOAuth: true,
    supportsRefresh: true,
    supportsWebhooks: true,
    connectable: false,
  },
};

export { SUPPORTED_MARKETPLACE_PROVIDERS } from '../utils/providers';

export function isSupportedMarketplaceProvider(provider: string): provider is MarketplaceProvider {
  return provider in MARKETPLACE_PROVIDER_REGISTRY;
}

export function isConnectableMarketplaceProvider(
  provider: string,
): provider is MarketplaceProvider {
  return (
    isSupportedMarketplaceProvider(provider) && MARKETPLACE_PROVIDER_REGISTRY[provider].connectable
  );
}

export function getProviderCapabilities(
  provider: MarketplaceProvider,
): MarketplaceProviderCapabilities {
  return MARKETPLACE_PROVIDER_REGISTRY[provider];
}
