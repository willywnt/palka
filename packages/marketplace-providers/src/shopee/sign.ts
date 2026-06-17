import { createHmac } from 'node:crypto';

/**
 * Builds the Shopee Open Platform v2 signature base string.
 *
 * Unlike Lazada (which signs the sorted business params), Shopee signs a FIXED
 * concatenation that does NOT include the business params (open.shopee.com,
 * "Authentication & Authorization → Signature"):
 *   - public / shop-independent APIs:  `partner_id + api_path + timestamp`
 *   - shop-scoped APIs:                `partner_id + api_path + timestamp + access_token + shop_id`
 *   - merchant-scoped APIs:            `partner_id + api_path + timestamp + access_token + merchant_id`
 *
 * `api_path` is the path only (e.g. `/api/v2/product/update_stock`), no query string.
 * `timestamp` is UNIX SECONDS.
 */
export function buildShopeeSignBase(input: {
  partnerId: string;
  apiPath: string;
  timestamp: number;
  accessToken?: string;
  shopId?: string;
}): string {
  let base = `${input.partnerId}${input.apiPath}${input.timestamp}`;
  if (input.accessToken) base += input.accessToken;
  if (input.shopId) base += input.shopId;
  return base;
}

/**
 * Signs a Shopee request: HMAC-SHA256(partner_key, baseString) as LOWER-case hex
 * (Lazada uses upper-case — Shopee expects lower). The result is the `sign` query param.
 */
export function signShopeeRequest(input: {
  partnerId: string;
  partnerKey: string;
  apiPath: string;
  timestamp: number;
  accessToken?: string;
  shopId?: string;
}): string {
  const base = buildShopeeSignBase(input);
  return createHmac('sha256', input.partnerKey).update(base, 'utf8').digest('hex');
}
