import { decode, encode } from 'next-auth/jwt';

import {
  SOCKET_AUTH_TOKEN_SALT,
  SOCKET_AUTH_TOKEN_TTL_SECONDS,
} from '../src/modules/scanner-pairing/config';

/**
 * Short-lived handshake auth token for the pairing socket.
 *
 * In production the Socket.IO server runs on a separate host (NEXT_PUBLIC_SOCKET_URL),
 * so the next-auth session cookie cannot be relied on cross-origin. Instead the app
 * (same-origin to the browser, where the cookie IS sent) mints a short-lived token
 * with `signScannerSocketToken`, the browser passes it in the Socket.IO handshake
 * `auth` payload, and the socket host validates it with `verifyScannerSocketToken`
 * using the same AUTH_SECRET. Both sides share a dedicated salt (decoupled from the
 * session-cookie name) — see `SOCKET_AUTH_TOKEN_SALT`.
 */

type SocketTokenPayload = { id: string };

function requireAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is required to sign scanner socket tokens');
  }
  return secret;
}

/** Mint a short-lived token carrying the user id (app side, runs where the cookie is in scope). */
export async function signScannerSocketToken(userId: string): Promise<string> {
  return encode<SocketTokenPayload>({
    token: { id: userId },
    secret: requireAuthSecret(),
    salt: SOCKET_AUTH_TOKEN_SALT,
    maxAge: SOCKET_AUTH_TOKEN_TTL_SECONDS,
  });
}

/**
 * Validate a handshake token (socket host side). Returns the payload, or `null` when
 * the secret is missing, the token is malformed/tampered, or it has expired — `decode`
 * (jose `jwtDecrypt`) enforces `exp`, so an expired token throws and is caught here.
 */
export async function verifyScannerSocketToken(token: string): Promise<SocketTokenPayload | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return null;
  }

  try {
    const payload = await decode<SocketTokenPayload>({
      token,
      secret,
      salt: SOCKET_AUTH_TOKEN_SALT,
    });

    if (payload && typeof payload.id === 'string' && payload.id.length > 0) {
      return { id: payload.id };
    }

    return null;
  } catch {
    return null;
  }
}
