import 'server-only';

import {
  extendCorrelationContext,
  REQUEST_ID_HEADER,
  resolveRequestId,
  runWithRequestId,
} from '@palka/logger/server';

export function getRequestIp(request: Request): string {
  // SECURITY: derive the client IP from the proxy-appended position, NOT a client-supplied one.
  // The single Traefik proxy APPENDS the real connecting peer as the LAST x-forwarded-for hop, so
  // the rightmost token is trustworthy while the leftmost is attacker-controlled — keying
  // rate-limit / login-lockout buckets on the leftmost would let any client spoof
  // `X-Forwarded-For: <random>` to evade or starve a bucket. Assumes exactly ONE trusted proxy hop
  // (true for the single-replica VPS deploy); revisit if a CDN / second proxy is added in front.
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((hop) => hop.trim())
      .filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1]!;
  }

  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function runWithRequestContext<T>(
  request: Request,
  userId: string | undefined,
  fn: () => T | Promise<T>,
): Promise<T> {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));

  return Promise.resolve(
    runWithRequestId(requestId, () => {
      if (userId) {
        extendCorrelationContext({ userId });
      }

      return fn();
    }),
  );
}
