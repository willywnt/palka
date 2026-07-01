import 'server-only';

import { timingSafeEqual } from 'crypto';

import { getServerEnv } from '@palka/config/env.server';
import { NextResponse } from 'next/server';

import { getRequestIp } from './request-context';

/**
 * Secret guarding the loopback-only internal endpoints (scheduled order pull, monthly finance
 * auto-gen) that server.ts triggers. Prefers a dedicated INTERNAL_API_SECRET so a leak there can't
 * also unlock sessions; falls back to AUTH_SECRET ONLY in dev (see {@link guardInternalRequest},
 * which refuses the fallback in prod).
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
 * Is `ip` a loopback / private-network / link-local address (i.e. NOT a public internet address)?
 * Handles IPv4, IPv6 loopback/ULA/link-local, and IPv4-mapped IPv6 (`::ffff:127.0.0.1`).
 */
function isPrivateOrLoopback(ip: string): boolean {
  const v = ip
    .trim()
    .replace(/^\[|\]$/g, '') // strip IPv6 brackets
    .replace(/%.*$/, '') // strip IPv6 zone id
    .replace(/^::ffff:/i, '') // unwrap IPv4-mapped IPv6
    .toLowerCase();
  if (v === '' || v === '::1' || v === '::') return true; // loopback / unspecified
  if (/^127\./.test(v)) return true; // IPv4 loopback
  if (/^10\./.test(v)) return true; // private
  if (/^192\.168\./.test(v)) return true; // private
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v)) return true; // private
  if (/^169\.254\./.test(v)) return true; // IPv4 link-local
  if (/^(fc|fd)/.test(v)) return true; // IPv6 ULA (fc00::/7)
  if (/^fe80:/.test(v)) return true; // IPv6 link-local
  return false;
}

/** True only when the request genuinely arrived from the public internet (a public client IP). */
function isExternalRequest(request: Request): boolean {
  const ip = getRequestIp(request);
  if (ip === 'unknown') return false;
  return !isPrivateOrLoopback(ip);
}

/**
 * Guard for the internal, secret-gated endpoints (scheduled order pull, monthly finance auto-gen).
 * The ONLY legitimate caller is server.ts on the loopback interface. A request that genuinely arrived
 * from the public internet (a PUBLIC client IP, i.e. through the TLS proxy) is rejected with a flat
 * 403 — BEFORE the secret is even checked — so a public caller can't probe the secret or burn
 * resources even if the secret leaks. The loopback caller is then verified by the constant-time
 * bearer secret.
 *
 * We key on the REAL client IP ({@link getRequestIp}), NOT the mere presence of a forwarding header:
 * Next's node server appends `x-forwarded-for` (from the socket) to EVERY request — including the
 * loopback cron — so a header-presence check 403s the legitimate caller too (this was the bug). A
 * loopback / private / unknown client IP is internal; only a public IP is rejected. Returns a Response
 * to short-circuit, or null to proceed.
 */
export function guardInternalRequest(request: Request): NextResponse | null {
  const env = getServerEnv();
  // In production a DEDICATED secret is mandatory — never authenticate the internal endpoints with
  // AUTH_SECRET (which would couple them to session signing). If it's unset, refuse outright (the
  // cron then fails visibly with a 503 until INTERNAL_API_SECRET is configured) rather than fall
  // back. Dev keeps the AUTH_SECRET fallback (internalSecret) for convenience.
  if (env.NODE_ENV === 'production' && !env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'internal_secret_unset' }, { status: 503 });
  }

  if (isExternalRequest(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (!hasValidSecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  return null;
}
