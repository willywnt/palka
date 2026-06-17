import { signShopeeRequest } from './sign.js';
import type {
  ShopeeCallOptions,
  ShopeeClient,
  ShopeeClientConfig,
  ShopeeResponse,
} from './types.js';

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Minimal Shopee Open Platform v2 REST client: builds the signed request, sends it,
 * and normalizes the response envelope. Every call carries `partner_id`, `timestamp`
 * and `sign` in the query string; shop-scoped calls also add `access_token` + `shop_id`
 * (which additionally enter the signature base — see {@link signShopeeRequest}). GET puts
 * business params in the query; POST sends them as a JSON body. Mirrors the Lazada client's
 * shape so the worker stock adapter + web import adapter consume an identical envelope.
 */
export function createShopeeClient(config: ShopeeClientConfig): ShopeeClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const nowSeconds = config.now ?? (() => Math.floor(Date.now() / 1000));

  return {
    async call<T = unknown>(
      apiPath: string,
      options: ShopeeCallOptions = {},
    ): Promise<ShopeeResponse<T>> {
      const timestamp = nowSeconds();
      const sign = signShopeeRequest({
        partnerId: config.partnerId,
        partnerKey: config.partnerKey,
        apiPath,
        timestamp,
        accessToken: options.accessToken,
        shopId: options.shopId,
      });

      const query = new URLSearchParams();
      query.set('partner_id', config.partnerId);
      query.set('timestamp', String(timestamp));
      query.set('sign', sign);
      if (options.accessToken) query.set('access_token', options.accessToken);
      if (options.shopId) query.set('shop_id', options.shopId);

      const method = options.method ?? 'GET';
      const init: RequestInit = { method };
      const params = options.params ?? {};

      if (method === 'GET') {
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined && value !== null) query.set(key, String(value));
        }
      } else {
        init.body = JSON.stringify(params);
        init.headers = { 'content-type': 'application/json' };
      }

      const url = `${config.baseUrl}${apiPath}?${query.toString()}`;
      const response = await fetchImpl(url, init);
      const raw = (await response.json()) as Record<string, unknown>;

      return {
        error: readString(raw.error) ?? '',
        message: readString(raw.message),
        requestId: readString(raw.request_id),
        warning: readString(raw.warning),
        response: raw.response as T | undefined,
        raw,
      };
    },
  };
}

/** A Shopee v2 envelope is successful when its `error` field is empty. */
export function isShopeeSuccess(response: ShopeeResponse): boolean {
  return response.error === '';
}
