import { createHmac } from 'node:crypto';

import type { LazadaParams } from './types.js';

/**
 * Signs a Lazada Open Platform (LazOP) request.
 *
 * Algorithm (open.lazada.com, app_key/app_secret scheme):
 *   1. drop the `sign` param and any undefined values
 *   2. sort the remaining param names ascending (ASCII)
 *   3. concatenate `${name}${value}` for each, in order (no separators)
 *   4. prepend the API path -> signBase = apiPath + concatenation
 *   5. HMAC-SHA256(appSecret, signBase) as upper-case hex
 *
 * This is the modern scheme, NOT the legacy SellerCenter `name=value&…` signing.
 */
export function signLazadaRequest(input: {
  apiPath: string;
  params: LazadaParams;
  appSecret: string;
}): string {
  const signBase = Object.entries(input.params)
    .filter(([key, value]) => key !== 'sign' && value !== undefined)
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .reduce((acc, [key, value]) => `${acc}${key}${value}`, input.apiPath);

  return createHmac('sha256', input.appSecret).update(signBase, 'utf8').digest('hex').toUpperCase();
}
