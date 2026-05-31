import type { MarketplaceProvider } from '@prisma/client';

import type {
  NormalizedStockUpdateRequest,
  NormalizedStockUpdateResponse,
} from './stock-normalizer.js';
import { MarketplaceSyncError } from './sync-errors.js';

export type StockProviderUpdateParams = NormalizedStockUpdateRequest & {
  accessToken: string;
};

export interface MarketplaceStockProviderAdapter {
  readonly provider: MarketplaceProvider;
  updateStock(params: StockProviderUpdateParams): Promise<NormalizedStockUpdateResponse>;
  validateStockSync(accessToken: string): Promise<{ ready: boolean; reason?: string }>;
}

export class DevMarketplaceStockProvider implements MarketplaceStockProviderAdapter {
  readonly provider: MarketplaceProvider;

  constructor(provider: MarketplaceProvider) {
    this.provider = provider;
  }

  async updateStock(params: StockProviderUpdateParams): Promise<NormalizedStockUpdateResponse> {
    if (!params.accessToken.trim()) {
      throw MarketplaceSyncError.invalidToken();
    }

    return {
      success: true,
      externalStock: params.quantity,
      raw: {
        devMode: true,
        provider: this.provider,
        externalVariantId: params.externalVariantId,
        quantity: params.quantity,
      },
    };
  }

  async validateStockSync(accessToken: string): Promise<{ ready: boolean; reason?: string }> {
    if (!accessToken.trim()) {
      return { ready: false, reason: 'Access token is empty.' };
    }

    return { ready: true };
  }
}

export class UnwiredMarketplaceStockProvider implements MarketplaceStockProviderAdapter {
  readonly provider: MarketplaceProvider;

  constructor(provider: MarketplaceProvider) {
    this.provider = provider;
  }

  async updateStock(_params: StockProviderUpdateParams): Promise<NormalizedStockUpdateResponse> {
    throw MarketplaceSyncError.providerUnavailable(
      `${this.provider} stock update API is not wired yet.`,
    );
  }

  async validateStockSync(accessToken: string): Promise<{ ready: boolean; reason?: string }> {
    if (!accessToken.trim()) {
      return { ready: false, reason: 'Access token is empty.' };
    }

    return { ready: false, reason: `${this.provider} stock sync API is not wired yet.` };
  }
}

const stockProviderRegistry = new Map<MarketplaceProvider, MarketplaceStockProviderAdapter>();

function useDevProviders(): boolean {
  return process.env.MARKETPLACE_SYNC_DEV_MODE === 'true';
}

export function getMarketplaceStockProvider(
  provider: MarketplaceProvider,
): MarketplaceStockProviderAdapter {
  const cached = stockProviderRegistry.get(provider);
  if (cached) return cached;

  const adapter = useDevProviders()
    ? new DevMarketplaceStockProvider(provider)
    : new UnwiredMarketplaceStockProvider(provider);

  stockProviderRegistry.set(provider, adapter);
  return adapter;
}

export function registerMarketplaceStockProvider(adapter: MarketplaceStockProviderAdapter): void {
  stockProviderRegistry.set(adapter.provider, adapter);
}
