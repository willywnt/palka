import type { MarketplaceProvider } from '@prisma/client';

import { MarketplaceSyncError } from './sync-errors.js';
import type {
  NormalizedStockUpdateRequest,
  NormalizedStockUpdateResponse,
} from './stock-normalizer.js';

/**
 * Credentials a shop-scoped provider call needs. `shopId` is required because some
 * providers (Shopee, TikTok/Tokopedia) must send the shop id on EVERY request — and it
 * is part of their signature base. `shopCipher` is the opaque shop identifier TikTok Shop
 * (Tokopedia channel) additionally requires on every shop-scoped call; null for the others.
 * Lazada embeds the shop in the token and ignores both.
 */
export type ProviderShopCredentials = {
  accessToken: string;
  shopId: string;
  shopCipher: string | null;
};

export type StockProviderUpdateParams = NormalizedStockUpdateRequest & ProviderShopCredentials;

/** Current external stock for one listing SKU, as reported by the provider. */
export type ProviderListingSnapshot = {
  externalProductId: string;
  externalVariantId: string;
  /** Total sellable across the SKU's warehouses (Σ). */
  stock: number;
  /**
   * Per-warehouse sellable (multi-warehouse providers; undefined otherwise). Lets drift read
   * the connection's sync warehouse's own sellable via {@link resolveSyncWarehouseStock}.
   */
  warehouses?: { code: string; sellable: number }[];
};

export interface MarketplaceStockProviderAdapter {
  readonly provider: MarketplaceProvider;
  updateStock(params: StockProviderUpdateParams): Promise<NormalizedStockUpdateResponse>;
  validateStockSync(params: ProviderShopCredentials): Promise<{ ready: boolean; reason?: string }>;
  /**
   * Pull current external stock per SKU for drift reconciliation (read-only).
   * Returns null when the provider can't enumerate listings (e.g. the Dev/Unwired
   * stub) so the reconciliation job skips it instead of flagging false drift.
   */
  fetchListings(params: ProviderShopCredentials): Promise<ProviderListingSnapshot[] | null>;
  /**
   * Pull current external stock for SPECIFIC items only (drift) — far cheaper than a
   * full-catalog scan. Optional; the job falls back to {@link fetchListings} when absent.
   */
  fetchListingsForItems?(
    params: ProviderShopCredentials & { externalProductIds: string[] },
  ): Promise<ProviderListingSnapshot[] | null>;
}

/** Simulates a successful push so the whole pipeline is exercisable without real APIs. */
export class DevMarketplaceStockProvider implements MarketplaceStockProviderAdapter {
  constructor(readonly provider: MarketplaceProvider) {}

  updateStock(params: StockProviderUpdateParams): Promise<NormalizedStockUpdateResponse> {
    return Promise.resolve({
      success: true,
      externalStock: params.quantity,
      raw: { simulated: true, provider: this.provider, quantity: params.quantity },
    });
  }

  validateStockSync(): Promise<{ ready: boolean }> {
    return Promise.resolve({ ready: true });
  }

  fetchListings(): Promise<ProviderListingSnapshot[] | null> {
    return Promise.resolve(null);
  }
}

/** Stand-in for a provider whose real adapter has not been wired yet. */
export class UnwiredMarketplaceStockProvider implements MarketplaceStockProviderAdapter {
  constructor(readonly provider: MarketplaceProvider) {}

  updateStock(): Promise<NormalizedStockUpdateResponse> {
    return Promise.reject(
      MarketplaceSyncError.providerUnavailable(`No stock adapter wired for ${this.provider}.`),
    );
  }

  validateStockSync(): Promise<{ ready: boolean; reason?: string }> {
    return Promise.resolve({ ready: false, reason: 'Provider adapter not wired.' });
  }

  fetchListings(): Promise<ProviderListingSnapshot[] | null> {
    return Promise.resolve(null);
  }
}

const registry = new Map<MarketplaceProvider, MarketplaceStockProviderAdapter>();

export function registerMarketplaceStockProvider(adapter: MarketplaceStockProviderAdapter): void {
  registry.set(adapter.provider, adapter);
}

/** Defaults to the Dev (simulated) adapter so stubbed end-to-end sync works today. */
export function getMarketplaceStockProvider(
  provider: MarketplaceProvider,
): MarketplaceStockProviderAdapter {
  const existing = registry.get(provider);
  if (existing) return existing;

  const adapter = new DevMarketplaceStockProvider(provider);
  registry.set(provider, adapter);
  return adapter;
}
