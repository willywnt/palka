import 'server-only';

import { timingSafeEqual } from 'crypto';

import { getServerEnv } from '@palka/config/env.server';
import { NextResponse } from 'next/server';

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
 * Guard for the internal, secret-gated endpoints. The ONLY legitimate caller is server.ts on the
 * loopback interface, which never traverses the TLS proxy and so carries NO forwarding header. Any
 * request that arrived through the proxy (`x-forwarded-for` / `x-real-ip` present) is by definition
 * not the cron, so it is rejected outright with a flat 403 — it never even reaches the secret check.
 * That removes the public attack surface (the path is still routable through Traefik, but a proxied
 * request can't probe the secret or burn resources). The headerless loopback caller is then verified
 * by the constant-time bearer secret. Returns a Response to short-circuit, or null to proceed.
 */
export function guardInternalRequest(request: Request): NextResponse | null {
  const isProxied = request.headers.has('x-forwarded-for') || request.headers.has('x-real-ip');
  if (isProxied) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (!hasValidSecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  return null;
}
