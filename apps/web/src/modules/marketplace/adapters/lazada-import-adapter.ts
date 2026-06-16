import 'server-only';

import { getServerEnv } from '@falka/config/env.server';
import {
  createLazadaClient,
  fetchLazadaItemsStock,
  fetchLazadaListings,
  LazadaApiError,
} from '@falka/marketplace-providers';
import type { LazadaClient, LazadaListingItem } from '@falka/marketplace-providers';
import type { MarketplaceProvider } from '@prisma/client';

import { MarketplaceError } from '../errors/marketplace-errors';
import type { MarketplaceImportAdapter, NormalizedListing } from './import-adapter';

const DEFAULT_BASE_URL = 'https://api.lazada.co.id/rest';

function toNormalizedListings(items: LazadaListingItem[]): NormalizedListing[] {
  return items.map((item) => ({
    externalProductId: item.itemId,
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

function wrapLazadaError(error: unknown): never {
  if (error instanceof LazadaApiError) {
    throw MarketplaceError.validation(
      `Lazada import failed (code ${error.code}${
        error.providerMessage ? `: ${error.providerMessage}` : ''
      }).`,
    );
  }
  throw error;
}

/**
 * Imports a Lazada shop's live listings via the shared LazOP fetchers, mapping each
 * SKU to our cross-provider {@link NormalizedListing}. Real provider adapter — replaces
 * the stub for LAZADA once the app credentials are configured.
 */
export class LazadaImportAdapter implements MarketplaceImportAdapter {
  readonly provider: MarketplaceProvider = 'LAZADA';
  private readonly client: LazadaClient;

  constructor() {
    const env = getServerEnv();
    this.client = createLazadaClient({
      appKey: env.LAZADA_APP_KEY ?? '',
      appSecret: env.LAZADA_APP_SECRET ?? '',
      baseUrl: env.LAZADA_API_BASE_URL ?? DEFAULT_BASE_URL,
    });
  }

  async fetchListings(params: {
    shopId: string;
    accessToken: string;
  }): Promise<NormalizedListing[]> {
    try {
      // Import is idempotent + re-runnable, so keep a throttled tail rather than failing
      // a whole large-catalog import on Lazada's flow control.
      const items = await fetchLazadaListings(this.client, {
        accessToken: params.accessToken,
        onThrottle: 'partial',
      });
      return toNormalizedListings(items);
    } catch (error) {
      wrapLazadaError(error);
    }
  }

  async fetchListingsForItems(params: {
    accessToken: string;
    externalProductIds: string[];
  }): Promise<NormalizedListing[]> {
    try {
      // Drift only needs the mapped items, so read those directly (one /product/item/get
      // each) instead of paging the whole catalog.
      const items = await fetchLazadaItemsStock(this.client, {
        accessToken: params.accessToken,
        itemIds: params.externalProductIds,
      });
      return toNormalizedListings(items);
    } catch (error) {
      wrapLazadaError(error);
    }
  }
}
