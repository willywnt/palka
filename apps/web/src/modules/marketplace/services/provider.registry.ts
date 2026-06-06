import type { MarketplaceProvider } from '@prisma/client';

export type MarketplaceProviderCapabilities = {
  supportsOAuth: boolean;
  supportsRefresh: boolean;
  supportsWebhooks: boolean;
};

/** Provider-ready registry for future OAuth, refresh, and sync integrations. */
export const MARKETPLACE_PROVIDER_REGISTRY: Record<
  MarketplaceProvider,
  MarketplaceProviderCapabilities
> = {
  SHOPEE: {
    supportsOAuth: true,
    supportsRefresh: true,
    supportsWebhooks: true,
  },
  TOKOPEDIA: {
    supportsOAuth: true,
    supportsRefresh: true,
    supportsWebhooks: true,
  },
  LAZADA: {
    supportsOAuth: true,
    supportsRefresh: true,
    supportsWebhooks: true,
  },
};

export { SUPPORTED_MARKETPLACE_PROVIDERS } from '../utils/providers';

export function isSupportedMarketplaceProvider(provider: string): provider is MarketplaceProvider {
  return provider in MARKETPLACE_PROVIDER_REGISTRY;
}

export function getProviderCapabilities(
  provider: MarketplaceProvider,
): MarketplaceProviderCapabilities {
  return MARKETPLACE_PROVIDER_REGISTRY[provider];
}
