/** Pause helper for paced paging / retry backoff. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lazada's flow-control / "system busy" responses are transient — the same call
 * usually succeeds after a short wait. Covers the listings throttles (E1002 Sentinel,
 * E506 "Get product failed", SellerCallLimit), the gateway speed-limit throttle
 * (901 / "E0901: Limit service request speed…" / "request too frequent"), and the
 * order-API call-limit / "access frequency exceeds the limit" throttles — all
 * intermittent backend throttles rather than bad input. Shared by the listings +
 * orders fetchers. NOTE: there is NO Retry-After / wait hint in the response, so the
 * caller must back off on its own (see the listings/orders backoff loops).
 */
export function isTransientLazadaError(code: string, message: string | undefined): boolean {
  return (
    code === '901' ||
    code === '1002' ||
    code === '506' ||
    code === 'SellerCallLimit' ||
    /sentinel|system\s*busy|flow\s*control|try\s*again|get product failed|access frequency|frequency exceeds|request\s+speed|too\s+frequent/i.test(
      message ?? '',
    )
  );
}
