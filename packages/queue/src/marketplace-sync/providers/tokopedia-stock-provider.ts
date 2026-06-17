import { getServerEnv } from '@falka/config/env.server';
import {
  buildTikTokInventoryUpdateBody,
  createTikTokClient,
  fetchTikTokItemsStock,
  fetchTikTokListings,
  isTikTokSuccess,
} from '@falka/marketplace-providers';
import type { TikTokClient, TikTokResponse } from '@falka/marketplace-providers';
import type { MarketplaceProvider } from '@prisma/client';

import type { NormalizedStockUpdateResponse } from '../stock-normalizer.js';
import type {
  MarketplaceStockProviderAdapter,
  ProviderListingSnapshot,
  ProviderShopCredentials,
  StockProviderUpdateParams,
} from '../stock-provider.registry.js';
import { MarketplaceSyncError, SYNC_ERROR_CODES } from '../sync-errors.js';

// The TOKOPEDIA channel runs on the TikTok Shop Open API (the standalone Tokopedia API was
// terminated). Stock is set ABSOLUTELY via /product/202309/products/{id}/inventory/update (POST);
// shop-scoped calls need shop_cipher (resolved + stored at OAuth). Multi-warehouse is
// non-destructive: with a syncWarehouseCode only that warehouse_id is written.
const INVENTORY_UPDATE_PATH = (productId: string): string =>
  `/product/202309/products/${productId}/inventory/update`;
const SHOPS_PATH = '/authorization/202309/shops';
const DEFAULT_BASE_URL = 'https://open-api.tiktokglobalshop.com';

/**
 * Maps a TikTok error envelope to a sync error. TikTok codes are numbers + a message string.
 * Token/auth → non-retryable (re-auth); rate/throttle/internal → transient (retry); the rest
 * are caller/business rejections → non-retryable. VERIFY exact codes against the live docs.
 */
function mapTikTokError(response: TikTokResponse): MarketplaceSyncError {
  const message = `TikTok Shop rejected the request (code ${response.code}${
    response.message ? `: ${response.message}` : ''
  }).`;
  const text = `${response.code} ${response.message ?? ''}`;

  if (/token|auth|unauthorized|access_token/i.test(text)) {
    return new MarketplaceSyncError(SYNC_ERROR_CODES.INVALID_TOKEN, message, { retryable: false });
  }
  if (/rate|limit|throttl|timeout|internal|busy|try again/i.test(text)) {
    return MarketplaceSyncError.syncFailed(message, true);
  }
  return MarketplaceSyncError.syncFailed(message, false);
}

function toSnapshot(item: {
  productId: string;
  skuId: string;
  quantity: number;
  warehouses: { code: string; sellable: number }[];
}): ProviderListingSnapshot {
  return {
    externalProductId: item.productId,
    externalVariantId: item.skuId,
    stock: item.quantity,
    warehouses: item.warehouses,
  };
}

/**
 * Pushes available stock to a TikTok Shop (Tokopedia channel) listing. Real provider adapter —
 * replaces the Dev stub once registered (worker bootstrap, gated on TOKOPEDIA_APP_KEY/SECRET).
 * The access token + shop_cipher come from the connection (decrypted/loaded by the engine).
 */
export class TokopediaStockProvider implements MarketplaceStockProviderAdapter {
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

  async updateStock(params: StockProviderUpdateParams): Promise<NormalizedStockUpdateResponse> {
    if (!params.shopCipher) {
      // A shop-scoped write can't be signed without the cipher — surface a clear, non-retryable
      // misconfiguration rather than burning retries on a guaranteed failure.
      throw MarketplaceSyncError.mappingInvalid(
        'TikTok shop_cipher belum tersedia untuk koneksi ini — sambungkan ulang toko.',
      );
    }

    const response = await this.client.call(INVENTORY_UPDATE_PATH(params.externalProductId), {
      method: 'POST',
      accessToken: params.accessToken,
      shopCipher: params.shopCipher,
      body: buildTikTokInventoryUpdateBody(params),
    });

    if (!isTikTokSuccess(response)) {
      throw mapTikTokError(response);
    }

    return {
      success: true,
      externalStock: params.quantity,
      raw: response.raw,
    };
  }

  async validateStockSync(
    params: ProviderShopCredentials,
  ): Promise<{ ready: boolean; reason?: string }> {
    // Token-scoped probe (no shop_cipher needed): if we can list the authorized shops, the token works.
    const response = await this.client.call(SHOPS_PATH, {
      method: 'GET',
      accessToken: params.accessToken,
    });

    return isTikTokSuccess(response)
      ? { ready: true }
      : { ready: false, reason: response.message ?? `TikTok error ${response.code}` };
  }

  async fetchListings(params: ProviderShopCredentials): Promise<ProviderListingSnapshot[] | null> {
    // Without the cipher we can't enumerate the shop — return null so drift SKIPS (no false drift).
    if (!params.shopCipher) return null;
    const items = await fetchTikTokListings(this.client, {
      accessToken: params.accessToken,
      shopCipher: params.shopCipher,
    });
    return items.map(toSnapshot);
  }

  async fetchListingsForItems(
    params: ProviderShopCredentials & { externalProductIds: string[] },
  ): Promise<ProviderListingSnapshot[] | null> {
    if (!params.shopCipher) return null;
    const items = await fetchTikTokItemsStock(this.client, {
      accessToken: params.accessToken,
      shopCipher: params.shopCipher,
      productIds: params.externalProductIds,
    });
    return items.map(toSnapshot);
  }
}
