import { getServerEnv } from '@falka/config/env.server';
import {
  buildLazadaSellableStockPayload,
  createLazadaClient,
  fetchLazadaItemsStock,
  fetchLazadaListings,
  isLazadaSuccess,
} from '@falka/marketplace-providers';
import type { LazadaClient, LazadaResponse } from '@falka/marketplace-providers';
import type { MarketplaceProvider } from '@prisma/client';

import type { NormalizedStockUpdateResponse } from '../stock-normalizer.js';
import type {
  MarketplaceStockProviderAdapter,
  ProviderListingSnapshot,
  StockProviderUpdateParams,
} from '../stock-provider.registry.js';
import { MarketplaceSyncError, SYNC_ERROR_CODES } from '../sync-errors.js';

// Sets ABSOLUTE sellable stock; POST with the XML payload (a GET → UnsupportedHTTPMethod;
// simple skuId/sellableQuantity params → E006). This is the stock-only path dropshipping-
// warehouse sellers can use — /product/price_quantity/update returns SELLER_NOT_PERMITTED
// for them. (Sibling /product/stock/sellable/ADJUST is a DELTA, not absolute — don't use it
// for sync.) Live-validated 2026-06-15.
const STOCK_UPDATE_PATH = '/product/stock/sellable/update';
const SELLER_GET_PATH = '/seller/get';
const DEFAULT_BASE_URL = 'https://api.lazada.co.id/rest';

function mapLazadaError(response: LazadaResponse): MarketplaceSyncError {
  const message = `Lazada rejected the request (code ${response.code}${
    response.message ? `: ${response.message}` : ''
  }).`;

  if (/token/i.test(response.code) || /token/i.test(response.message ?? '')) {
    return new MarketplaceSyncError(SYNC_ERROR_CODES.INVALID_TOKEN, message, { retryable: false });
  }

  // A 501 ("…failed") is a business-rule rejection (e.g. SELLER_NOT_PERMITTED, locked item)
  // — permanent for this product/seller even though type is ISP, so retrying never helps.
  // Don't burn retries on it.
  if (response.code === '501') {
    return MarketplaceSyncError.syncFailed(message, false);
  }

  // LazOP error `type`: ISV = caller error (bad params/sign) — not worth retrying;
  // ISP/SYSTEM = provider/platform — transient, so retry.
  return MarketplaceSyncError.syncFailed(message, response.type !== 'ISV');
}

/**
 * Per-SKU errors Lazada carries in `raw.detail[]` even when the ENVELOPE is `code:0`
 * (e.g. a non-existent item → `{field:'ItemId', message:'ITEM_NOT_FOUND', code:'E0501'}`).
 * A real success has no `detail`, so any populated entry means the SKU was NOT updated.
 */
function extractDetailErrors(raw: Record<string, unknown> | null): string[] {
  const detail = raw && Array.isArray(raw.detail) ? raw.detail : [];
  const errors: string[] = [];
  for (const entry of detail) {
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      const code = typeof record.code === 'string' ? record.code : undefined;
      const message = typeof record.message === 'string' ? record.message : undefined;
      if (code || message) {
        errors.push([record.field, message, code].filter(Boolean).join(' '));
      }
    }
  }
  return errors;
}

/**
 * Pushes available stock to a Lazada listing via the LazOP price/quantity update
 * API. Real provider adapter — replaces the Dev stub once registered (see the
 * worker bootstrap). The access token it receives is already decrypted by the
 * sync engine.
 */
export class LazadaStockProvider implements MarketplaceStockProviderAdapter {
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

  async updateStock(params: StockProviderUpdateParams): Promise<NormalizedStockUpdateResponse> {
    const response = await this.client.call(STOCK_UPDATE_PATH, {
      method: 'POST',
      accessToken: params.accessToken,
      params: { payload: buildLazadaSellableStockPayload(params) },
    });

    if (!isLazadaSuccess(response)) {
      throw mapLazadaError(response);
    }

    // Lazada can answer `code:0` yet reject the SKU in `detail[]` (e.g. ITEM_NOT_FOUND) —
    // that's NOT a real update, so don't mark the mapping synced. Non-retryable: a missing
    // or locked item won't fix itself on retry.
    const detailErrors = extractDetailErrors(response.raw);
    if (detailErrors.length > 0) {
      throw MarketplaceSyncError.syncFailed(
        `Lazada rejected the SKU: ${detailErrors.join('; ')}`,
        false,
      );
    }

    return {
      success: true,
      externalStock: params.quantity,
      raw: response.raw,
    };
  }

  async validateStockSync(accessToken: string): Promise<{ ready: boolean; reason?: string }> {
    const response = await this.client.call(SELLER_GET_PATH, { method: 'GET', accessToken });

    return isLazadaSuccess(response)
      ? { ready: true }
      : { ready: false, reason: response.message ?? `Lazada error ${response.code}` };
  }

  async fetchListings(params: { accessToken: string }): Promise<ProviderListingSnapshot[]> {
    const items = await fetchLazadaListings(this.client, { accessToken: params.accessToken });
    return items.map((item) => ({
      externalProductId: item.itemId,
      externalVariantId: item.skuId,
      stock: item.quantity,
      warehouses: item.warehouses,
    }));
  }

  async fetchListingsForItems(params: {
    accessToken: string;
    externalProductIds: string[];
  }): Promise<ProviderListingSnapshot[]> {
    const items = await fetchLazadaItemsStock(this.client, {
      accessToken: params.accessToken,
      itemIds: params.externalProductIds,
    });
    return items.map((item) => ({
      externalProductId: item.itemId,
      externalVariantId: item.skuId,
      stock: item.quantity,
      warehouses: item.warehouses,
    }));
  }
}
