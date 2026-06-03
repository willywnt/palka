import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encode } from 'next-auth/jwt';

import {
  signScannerSocketToken,
  verifyScannerSocketToken,
} from '../../socket-server/socket-auth-token';
import { SOCKET_AUTH_TOKEN_SALT } from '@/modules/scanner-pairing/config';

const AUTH_SECRET = 'test-secret-scanner-socket-aaaaaaaaaaaaaaaa';

/**
 * The pairing socket runs cross-origin in production, where the session cookie is not
 * sent. These tests pin the handshake-token contract: a freshly signed token verifies
 * to its user id, and anything tampered, foreign-signed, or expired is rejected.
 */
describe('scanner socket handshake token', () => {
  let originalSecret: string | undefined;

  beforeAll(() => {
    originalSecret = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = AUTH_SECRET;
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalSecret;
    }
  });

  it('round-trips: a signed token verifies back to the user id', async () => {
    const token = await signScannerSocketToken('user-123');
    await expect(verifyScannerSocketToken(token)).resolves.toEqual({ id: 'user-123' });
  });

  it('rejects a malformed token', async () => {
    await expect(verifyScannerSocketToken('not-a-real-token')).resolves.toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const foreign = await encode({
      token: { id: 'user-123' },
      secret: 'a-completely-different-secret-bbbbbbbbbbbbbbbb',
      salt: SOCKET_AUTH_TOKEN_SALT,
      maxAge: 120,
    });
    await expect(verifyScannerSocketToken(foreign)).resolves.toBeNull();
  });

  it('rejects an expired token', async () => {
    const expired = await encode({
      token: { id: 'user-123' },
      secret: AUTH_SECRET,
      salt: SOCKET_AUTH_TOKEN_SALT,
      maxAge: -3600,
    });
    await expect(verifyScannerSocketToken(expired)).resolves.toBeNull();
  });

  it('returns null when AUTH_SECRET is unset', async () => {
    const token = await signScannerSocketToken('user-123');
    delete process.env.AUTH_SECRET;
    try {
      await expect(verifyScannerSocketToken(token)).resolves.toBeNull();
    } finally {
      process.env.AUTH_SECRET = AUTH_SECRET;
    }
  });
});
