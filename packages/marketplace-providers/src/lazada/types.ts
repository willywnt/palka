export type LazadaParamValue = string | number | undefined;

export type LazadaParams = Record<string, LazadaParamValue>;

/** A Lazada Open Platform response envelope, normalized to camelCase. */
export type LazadaResponse<T = unknown> = {
  /** "0" on success; any other code denotes an error. */
  code: string;
  type?: string;
  message?: string;
  requestId?: string;
  data?: T;
  /** The full parsed JSON body, kept for logging/debugging. */
  raw: Record<string, unknown>;
};

export type LazadaCallOptions = {
  method?: 'GET' | 'POST';
  /** Seller access token; omit for unauthenticated calls such as token-create. */
  accessToken?: string;
  /** Business (API-specific) params, e.g. `{ payload: '<Request>…' }`. */
  params?: LazadaParams;
};

export interface LazadaClient {
  call<T = unknown>(apiPath: string, options?: LazadaCallOptions): Promise<LazadaResponse<T>>;
}

export type LazadaClientConfig = {
  appKey: string;
  appSecret: string;
  /** Regional REST gateway, e.g. `https://api.lazada.co.id/rest`. */
  baseUrl: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable clock in ms; defaults to `Date.now`. */
  now?: () => number;
};
