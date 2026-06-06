import { signLazadaRequest } from './sign.js';
import type {
  LazadaCallOptions,
  LazadaClient,
  LazadaClientConfig,
  LazadaParams,
  LazadaResponse,
} from './types.js';

const SUCCESS_CODE = '0';

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Minimal Lazada Open Platform REST client: builds the signed request, sends it,
 * and normalizes the response envelope. Transport mirrors the official Lazada
 * SDKs — GET puts every param in the query string; POST keeps the system params
 * + sign in the query and sends the business params as a form-urlencoded body.
 * The signature always covers system + business params together.
 */
export function createLazadaClient(config: LazadaClientConfig): LazadaClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const now = config.now ?? Date.now;

  return {
    async call<T = unknown>(
      apiPath: string,
      options: LazadaCallOptions = {},
    ): Promise<LazadaResponse<T>> {
      const method = options.method ?? 'GET';
      const businessParams: LazadaParams = { ...options.params };

      const systemParams: LazadaParams = {
        app_key: config.appKey,
        timestamp: String(now()),
        sign_method: 'sha256',
        ...(options.accessToken ? { access_token: options.accessToken } : {}),
      };

      const sign = signLazadaRequest({
        apiPath,
        params: { ...systemParams, ...businessParams },
        appSecret: config.appSecret,
      });

      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(systemParams)) {
        if (value !== undefined) query.set(key, String(value));
      }
      query.set('sign', sign);

      const init: RequestInit = { method };

      if (method === 'GET') {
        for (const [key, value] of Object.entries(businessParams)) {
          if (value !== undefined) query.set(key, String(value));
        }
      } else {
        const body = new URLSearchParams();
        for (const [key, value] of Object.entries(businessParams)) {
          if (value !== undefined) body.set(key, String(value));
        }
        init.body = body;
        init.headers = { 'content-type': 'application/x-www-form-urlencoded' };
      }

      const url = `${config.baseUrl}${apiPath}?${query.toString()}`;
      const response = await fetchImpl(url, init);
      const raw = (await response.json()) as Record<string, unknown>;

      return {
        code: readString(raw.code) ?? String(raw.code ?? ''),
        type: readString(raw.type),
        message: readString(raw.message),
        requestId: readString(raw.request_id),
        data: raw.data as T | undefined,
        raw,
      };
    },
  };
}

/** A LazOP envelope is successful when its code is exactly "0". */
export function isLazadaSuccess(response: LazadaResponse): boolean {
  return response.code === SUCCESS_CODE;
}
