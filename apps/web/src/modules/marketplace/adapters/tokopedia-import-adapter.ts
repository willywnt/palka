import 'server-only';

import { getServerEnv } from '@falka/config/env.server';
import {
  createTikTokClient,
  fetchTikTokItemsStock,
  fetchTikTokListings,
  TikTokApiError,
} from '@falka/marketplace-providers';
import type { TikTokClient, TikTokListingItem } from '@falka/marketplace-providers';
import type { MarketplaceProvider } from '@prisma/client';

import { MarketplaceError } from '../errors/marketplace-errors';
import type { MarketplaceImportAdapter, NormalizedListing } from './import-adapter';

const DEFAULT_BASE_URL = 'https://open-api.tiktokglobalshop.com';

function toNormalizedListings(items: TikTokListingItem[]): NormalizedListing[] {
  return items.map((item) => ({
    externalProductId: item.productId,
    externalVariantId: item.skuId,
    externalSku: item.sellerSku,
    externalProductName: item.productName,
    externalVariantName: item.variantName,
    stock: item.quantity,
    warehouses: item.warehouses,
    status: item.status,
    raw: item.raw,
  }));
}

function wrapTikTokError(error: unknown): never {
  if (error instanceof TikTokApiError) {
    throw MarketplaceError.validation(
      `TikTok Shop import failed (code ${error.code}${
        error.providerMessage ? `: ${error.providerMessage}` : ''
      }).`,
    );
  }
  throw error;
}

/** A shop-scoped call can't run without the cipher — surface a clear re-auth hint. */
function requireCipher(shopCipher: string | null): string {
  if (!shopCipher) {
    throw MarketplaceError.validation(
      'TikTok shop_cipher belum tersedia untuk koneksi ini — sambungkan ulang toko.',
    );
  }
  return shopCipher;
}

/**
 * Imports a TikTok Shop (Tokopedia channel) shop's live listings via the shared TikTok fetchers,
 * mapping each SKU to our cross-provider {@link NormalizedListing}. Real provider adapter —
 * replaces the stub for TOKOPEDIA once TOKOPEDIA_APP_KEY/SECRET are configured.
 */
export class TokopediaImportAdapter implements MarketplaceImportAdapter {
  readonly provider: MarketplaceProvider = 'TOKOPEDIA';
  private readonly client: TikTokClient;

  constructor() {
    const env = getServerEnv();
    this.client = createTikTokClient({
      appKey: env.TOKOPEDIA_APP_KEY ?? '',
      appSecret: env.TOKOPEDIA_APP_SECRET ?? '',
      baseUrl: env.TOKOPEDIA_API_BASE_URL ?? DEFAULT_BASE_URL,
    });
  }

  async fetchListings(params: {
    shopId: string;
    shopCipher: string | null;
    accessToken: string;
  }): Promise<NormalizedListing[]> {
    try {
      const items = await fetchTikTokListings(this.client, {
        accessToken: params.accessToken,
        shopCipher: requireCipher(params.shopCipher),
      });
      return toNormalizedListings(items);
    } catch (error) {
      wrapTikTokError(error);
    }
  }

  async fetchListingsForItems(params: {
    shopId: string;
    shopCipher: string | null;
    accessToken: string;
    externalProductIds: string[];
  }): Promise<NormalizedListing[]> {
    try {
      const items = await fetchTikTokItemsStock(this.client, {
        accessToken: params.accessToken,
        shopCipher: requireCipher(params.shopCipher),
        productIds: params.externalProductIds,
      });
      return toNormalizedListings(items);
    } catch (error) {
      wrapTikTokError(error);
    }
  }
}
