/** Pause helper for paced paging / retry backoff. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Shopee Open Platform v2 throttling arrives as an HTTP 200 with a non-empty envelope `error`
 * string (there is NO HTTP 429 and NO Retry-After), so the caller must pattern-match the code +
 * message and back off on its own. The tiered throttle codes (verified against the portal-mirroring
 * SDK schemas): the gateway QPS `error_rate_limit`, the per-shop `*.exceed_shop_api`, the per-app
 * `*.exceed_partner_api`, the per-API `*.exceed_api`, the generic `error_busy`/`error_server`/
 * `error_timeout`, and the per-APP DAILY call quota `error_limit` (resets at 00:00 UTC+8).
 *
 * NOTE: `error_limit` (the daily cap) IS transient but only recovers at the next UTC+8 midnight —
 * BullMQ's short backoff won't outwait it, so a per-app daily-quota guard is the real fix (see
 * docs/roadmap/shopee-api-research-2026-06-30.md §3). It is classified transient here so it is never
 * mistaken for a permanent business rejection.
 */
export function isTransientShopeeError(code: string, message?: string): boolean {
  const c = code.toLowerCase();
  if (
    c === 'error_rate_limit' ||
    c === 'error_limit' ||
    c === 'error_busy' ||
    c === 'error_server' ||
    c === 'error_timeout' ||
    c.includes('exceed_shop_api') ||
    c.includes('exceed_partner_api') ||
    c.includes('exceed_api') ||
    /rate[_\s]?limit|too[_\s]?many|throttl|system\s*busy|try\s*again|temporarily/i.test(c)
  ) {
    return true;
  }
  return /rate\s*limit|too\s*many|try\s*again|temporarily|system\s*busy|server\s*error|exceed.*api/i.test(
    message ?? '',
  );
}

/**
 * Shopee auth/token failures (e.g. `error_auth`, `error_token`, `invalid_access_token`,
 * `error_token_invalid`) mean the connection must be re-authorized — non-retryable, distinct from a
 * transient throttle. Permission/scope errors are NOT auth errors (the token is valid; the app type
 * lacks the module) and are handled as business rejections by the caller.
 */
export function isAuthShopeeError(code: string): boolean {
  const c = code.toLowerCase();
  return /auth|token|access_token|expired/.test(c) && !/rate/.test(c);
}
