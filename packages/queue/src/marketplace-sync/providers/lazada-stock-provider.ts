import { getServerEnv } from '@falka/config/env.server';
import {
  buildLazadaQuantityPayload,
  createLazadaClient,
  isLazadaSuccess,
} from '@falka/marketplace-providers';
import type { LazadaClient, LazadaResponse } from '@falka/marketplace-providers';
import type { MarketplaceProvider } from '@prisma/client';

import type { NormalizedStockUpdateResponse } from '../stock-normalizer.js';
import type {
  MarketplaceStockProviderAdapter,
  StockProviderUpdateParams,
} from '../stock-provider.registry.js';
import { MarketplaceSyncError, SYNC_ERROR_CODES } from '../sync-errors.js';

const STOCK_UPDATE_PATH = '/product/price_quantity/update';
const SELLER_GET_PATH = '/seller/get';
const DEFAULT_BASE_URL = 'https://api.lazada.co.id/rest';

function mapLazadaError(response: LazadaResponse): MarketplaceSyncError {
  const message = `Lazada rejected the request (code ${response.code}${
    response.message ? `: ${response.message}` : ''
  }).`;

  if (/token/i.test(response.code) || /token/i.test(response.message ?? '')) {
    return new MarketplaceSyncError(SYNC_ERROR_CODES.INVALID_TOKEN, message, { retryable: false });
  }

  // E501 ("Update product failed") is a business-rule rejection carried in detail[].bizCheck
  // (e.g. SELLER_NOT_PERMITTED, locked item) — permanent for this product/seller even though
  // type is ISP, so retrying never helps. Don't burn retries on it.
  if (response.code === '501') {
    return MarketplaceSyncError.syncFailed(message, false);
  }

  // LazOP error `type`: ISV = caller error (bad params/sign) — not worth retrying;
  // ISP/SYSTEM = provider/platform — transient, so retry.
  return MarketplaceSyncError.syncFailed(message, response.type !== 'ISV');
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
      params: { payload: buildLazadaQuantityPayload(params) },
    });

    if (!isLazadaSuccess(response)) {
      throw mapLazadaError(response);
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
}
