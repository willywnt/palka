import 'server-only';

import { timingSafeEqual } from 'crypto';

import { getServerEnv } from '@palka/config/env.server';
import { INTERNAL_RATE_LIMIT_PER_MINUTE } from '@palka/config/limits';
import { buildIpRateLimitKey, checkRateLimit } from '@palka/rate-limit';
import { NextResponse } from 'next/server';

import { getRequestIp } from '@/lib/api/request-context';

/**
 * Secret guarding the loopback-only internal endpoints (scheduled order pull, monthly finance
 * auto-gen) that server.ts triggers. Prefers a dedicated INTERNAL_API_SECRET so a leak there can't
 * also unlock sessions; falls back to AUTH_SECRET so a deploy that hasn't set the dedicated secret
 * yet keeps working (server.ts resolves the secret the same way).
 */
function internalSecret(): string {
  const env = getServerEnv();
  return env.INTERNAL_API_SECRET ?? env.AUTH_SECRET;
}

function hasValidSecret(request: Request): boolean {
  const expected = `Bearer ${internalSecret()}`;
  const provided = request.headers.get('authorization') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Guard for the internal, secret-gated endpoints. Rate-limits per caller IP FIRST — the legit
 * caller is server.ts on loopback (no forwarded IP, fires at most once per interval, far under the
 * ceiling), so this only bites an external flood / secret-guessing source reaching the app through
 * the proxy. Then verifies the bearer secret in constant time. Returns a Response to short-circuit,
 * or null when the request may proceed.
 */
export async function guardInternalRequest(request: Request): Promise<NextResponse | null> {
  const rateLimit = await checkRateLimit({
    key: buildIpRateLimitKey('internal', getRequestIp(request)),
    limit: INTERNAL_RATE_LIMIT_PER_MINUTE,
    windowSeconds: 60,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  if (!hasValidSecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  return null;
}
