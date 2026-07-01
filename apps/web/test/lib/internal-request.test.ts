import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Pins the internal-endpoint guard. The load-bearing fix: Next's node server appends
 * `x-forwarded-for` (from the socket) to EVERY request — including the loopback cron — so the guard
 * must key on the REAL client IP (loopback/private = internal), NOT the mere presence of the header.
 */
const { envMock } = vi.hoisted(() => ({ envMock: vi.fn() }));
vi.mock('@palka/config/env.server', () => ({ getServerEnv: envMock }));

const { guardInternalRequest } = await import('@/lib/api/internal-request');

const SECRET = 'internal-secret-value-0123456789abcdef01';

function req(headers: Record<string, string>): Request {
  return new Request('http://127.0.0.1:3000/api/v1/internal/finance-generate', {
    method: 'POST',
    headers,
  });
}

beforeEach(() => {
  envMock.mockReturnValue({
    NODE_ENV: 'production',
    INTERNAL_API_SECRET: SECRET,
    AUTH_SECRET: 'auth-secret',
  });
});

describe('guardInternalRequest', () => {
  it('allows the loopback cron (Next-appended x-forwarded-for 127.0.0.1) with a valid secret', () => {
    expect(
      guardInternalRequest(
        req({ 'x-forwarded-for': '127.0.0.1', authorization: `Bearer ${SECRET}` }),
      ),
    ).toBeNull();
  });

  it('allows a private-network caller (Docker) with a valid secret', () => {
    expect(
      guardInternalRequest(
        req({ 'x-forwarded-for': '172.20.0.5', authorization: `Bearer ${SECRET}` }),
      ),
    ).toBeNull();
  });

  it('allows IPv4-mapped-IPv6 loopback with a valid secret', () => {
    expect(
      guardInternalRequest(
        req({ 'x-forwarded-for': '::ffff:127.0.0.1', authorization: `Bearer ${SECRET}` }),
      ),
    ).toBeNull();
  });

  it('rejects a genuine PUBLIC caller with 403 — even with the correct secret', () => {
    const res = guardInternalRequest(
      req({ 'x-forwarded-for': '203.0.113.7', authorization: `Bearer ${SECRET}` }),
    );
    expect(res?.status).toBe(403);
  });

  it('uses the RIGHTMOST x-forwarded-for hop (public client behind the proxy → 403)', () => {
    // Traefik appends the real peer last; a spoofed private leftmost must not sneak past.
    const res = guardInternalRequest(
      req({ 'x-forwarded-for': '10.0.0.1, 203.0.113.9', authorization: `Bearer ${SECRET}` }),
    );
    expect(res?.status).toBe(403);
  });

  it('rejects a loopback caller with a WRONG secret (401)', () => {
    const res = guardInternalRequest(
      req({ 'x-forwarded-for': '127.0.0.1', authorization: 'Bearer wrong' }),
    );
    expect(res?.status).toBe(401);
  });

  it('returns 503 in production when INTERNAL_API_SECRET is unset', () => {
    envMock.mockReturnValue({
      NODE_ENV: 'production',
      INTERNAL_API_SECRET: undefined,
      AUTH_SECRET: 'auth-secret',
    });
    const res = guardInternalRequest(
      req({ 'x-forwarded-for': '127.0.0.1', authorization: `Bearer ${SECRET}` }),
    );
    expect(res?.status).toBe(503);
  });
});
