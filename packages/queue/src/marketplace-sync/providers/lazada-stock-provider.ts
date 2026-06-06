import { getServerEnv } from '@olshop/config/env.server';
import { createLazadaClient, isLazadaSuccess } from '@olshop/marketplace-providers';
import type { LazadaClient, LazadaResponse } from '@olshop/marketplace-providers';
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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** LazOP price/quantity update payload, keyed by SellerSku when known, else ItemId+SkuId. */
function buildQuantityPayload(params: StockProviderUpdateParams): string {
  const identity = params.externalSku
    ? `<SellerSku>${escapeXml(params.externalSku)}</SellerSku>`
    : `<ItemId>${escapeXml(params.externalProductId)}</ItemId>` +
      `<SkuId>${escapeXml(params.externalVariantId)}</SkuId>`;

  return `<Request><Product><Skus><Sku>${identity}<Quantity>${params.quantity}</Quantity></Sku></Skus></Product></Request>`;
}

function mapLazadaError(response: LazadaResponse): MarketplaceSyncError {
  const message = `Lazada rejected the request (code ${response.code}${
    response.message ? `: ${response.message}` : ''
  }).`;

  if (/token/i.test(response.code) || /token/i.test(response.message ?? '')) {
    return new MarketplaceSyncError(SYNC_ERROR_CODES.INVALID_TOKEN, message, { retryable: false });
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
      params: { payload: buildQuantityPayload(params) },
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
