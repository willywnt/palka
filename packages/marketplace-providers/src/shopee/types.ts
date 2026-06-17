/** Business params for a Shopee call — query values for GET, JSON body for POST. */
export type ShopeeRequestParams = Record<string, unknown>;

/** A Shopee Open Platform v2 response envelope, normalized to camelCase. */
export type ShopeeResponse<T = unknown> = {
  /**
   * Empty string ("") on success; any non-empty value is an error code
   * (e.g. "error_auth", "error_sign", "error_param"). This is Shopee's success
   * sentinel — there is no numeric "0" like Lazada.
   */
  error: string;
  message?: string;
  requestId?: string;
  warning?: string;
  /** The business payload Shopee nests under `response` (absent on auth/token calls). */
  response?: T;
  /** The full parsed JSON body, kept for logging/debugging and top-level token fields. */
  raw: Record<string, unknown>;
};

export type ShopeeCallOptions = {
  method?: 'GET' | 'POST';
  /** Shop access token; omit for public calls such as `auth/token/get`. */
  accessToken?: string;
  /**
   * Shop id for shop-scoped calls. When set it is appended to the signature base
   * (after the access token) and added to the query — Shopee requires both.
   */
  shopId?: string;
  /** Business (API-specific) params: query string for GET, JSON body for POST. */
  params?: ShopeeRequestParams;
};

export interface ShopeeClient {
  call<T = unknown>(apiPath: string, options?: ShopeeCallOptions): Promise<ShopeeResponse<T>>;
}

export type ShopeeClientConfig = {
  /** Shopee Open Platform partner id (numeric, carried as a string). */
  partnerId: string;
  /** Shopee Open Platform partner key — the HMAC-SHA256 secret. */
  partnerKey: string;
  /**
   * REST host: sandbox `https://partner.test-stable.shopeemobile.com` vs live
   * `https://partner.shopeemobile.com`. Switching environments is an env change only.
   */
  baseUrl: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable clock returning UNIX SECONDS (Shopee signs seconds); defaults to Date.now()/1000. */
  now?: () => number;
};
