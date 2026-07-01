import { createHmac, timingSafeEqual } from 'node:crypto';

import { isShopeeSuccess } from './client.js';
import { ShopeeApiError } from './listings.js';
import type { ShopeeClient, ShopeeResponse } from './types.js';

/**
 * Shopee Open Platform push message codes relevant to order sync (from the portal-mirrored schema).
 * Order-level (3, 4) carry `shop_id`; partner-level (2, 12) do NOT.
 */
export const SHOPEE_PUSH_CODE = {
  /**
   * Registration / connectivity test push. `set_app_push_config` (and the Console "Verify" button)
   * test-POSTs the callback URL and judges it ONLY on a fast 2xx (the ping may be UNSIGNED and carries
   * `verify_info` to echo). It has NO order side effect, so the receiver answers it BEFORE the HMAC check.
   */
  VERIFY: 0,
  /** Shop revoked the app's authorization — the connection can no longer sync. */
  SHOP_DEAUTHORIZATION: 2,
  /** Order status changed (thin: order_sn + status — hydrate via get_order_detail). */
  ORDER_STATUS: 3,
  /** Tracking number assigned for a shipped order. */
  TRACKING_NUMBER: 4,
  /** OpenAPI authorization is nearing expiry (365-day re-auth). */
  AUTH_EXPIRY: 12,
} as const;

/** The order-relevant codes to subscribe to via set_app_push_config. */
export const SHOPEE_ORDER_PUSH_CODES: number[] = [
  SHOPEE_PUSH_CODE.ORDER_STATUS,
  SHOPEE_PUSH_CODE.TRACKING_NUMBER,
  SHOPEE_PUSH_CODE.SHOP_DEAUTHORIZATION,
  SHOPEE_PUSH_CODE.AUTH_EXPIRY,
];

export type ShopeePushEnvelope = {
  /** Shop id as a STRING (matches MarketplaceConnection.shopId); null for partner-level codes. */
  shopId: string | null;
  code: number;
  /** UNIX seconds; null when absent/unparseable. */
  timestamp: number | null;
  /** The parsed `data` object (Shopee sends it as a JSON STRING on some codes — unwrapped here). */
  data: Record<string, unknown>;
};

/**
 * Verify a Shopee push webhook signature. Shopee signs
 *   HMAC-SHA256(partner_key, `${callbackUrl}|${rawBody}`) as LOWER-case hex, carried RAW (no prefix)
 * in the `Authorization` header. VERIFY OVER THE RAW REQUEST BYTES — never re-serialize the JSON, and
 * `callbackUrl` MUST be the exact URL registered with Shopee (from config), NOT `request.url` (a proxy
 * rewrite or spoofed Host must not shift the base string). Constant-time compare.
 */
export function verifyShopeePush(input: {
  callbackUrl: string;
  rawBody: string;
  authorizationHeader: string | null;
  partnerKey: string;
}): boolean {
  const provided = (input.authorizationHeader ?? '').trim();
  if (!provided || !input.partnerKey) return false;
  const expected = createHmac('sha256', input.partnerKey)
    .update(`${input.callbackUrl}|${input.rawBody}`, 'utf8')
    .digest('hex');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readShopId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return null;
}

function readSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Parse a Shopee push envelope `{ shop_id, code, timestamp, data }`. `data` may arrive as a JSON
 * STRING (some codes) or an object — both are unwrapped. Returns null when the body isn't a valid
 * envelope (no numeric `code`).
 */
export function parseShopeePush(rawBody: string): ShopeePushEnvelope | null {
  let outer: Record<string, unknown>;
  try {
    outer = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!outer || typeof outer !== 'object') return null;

  const code = readSeconds(outer.code);
  if (code === null) return null;

  let data: Record<string, unknown> = {};
  const rawData = outer.data;
  if (typeof rawData === 'string') {
    try {
      const parsed = JSON.parse(rawData) as unknown;
      if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>;
    } catch {
      data = {};
    }
  } else if (rawData && typeof rawData === 'object') {
    data = rawData as Record<string, unknown>;
  }

  return {
    shopId: readShopId(outer.shop_id),
    code,
    timestamp: readSeconds(outer.timestamp),
    data,
  };
}

const SET_PUSH_CONFIG_PATH = '/api/v2/push/set_app_push_config';
const GET_PUSH_CONFIG_PATH = '/api/v2/push/get_app_push_config';

/**
 * Register the app's ONE per-partner push callback URL + subscribed message codes. Public API (no
 * access_token/shop_id) — the client signs it with the partner base. Shopee test-pings the URL
 * expecting a 2xx within ~3s at registration. Throws {@link ShopeeApiError} on a non-empty envelope.
 */
export async function setShopeePushConfig(
  client: ShopeeClient,
  input: { callbackUrl: string; codes: number[]; blockedShopIds?: number[] },
): Promise<ShopeeResponse> {
  const response = await client.call(SET_PUSH_CONFIG_PATH, {
    method: 'POST',
    params: {
      callback_url: input.callbackUrl,
      set_push_config_on: input.codes,
      ...(input.blockedShopIds ? { blocked_shop_id_list: input.blockedShopIds } : {}),
    },
  });
  if (!isShopeeSuccess(response)) throw new ShopeeApiError(response.error, response.message);
  return response;
}

/** Read back the app's current push config (callback URL + subscribed codes). */
export async function getShopeePushConfig(client: ShopeeClient): Promise<ShopeeResponse> {
  const response = await client.call(GET_PUSH_CONFIG_PATH, { method: 'GET' });
  if (!isShopeeSuccess(response)) throw new ShopeeApiError(response.error, response.message);
  return response;
}
