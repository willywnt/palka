import 'server-only';

import { signScannerSocketToken } from '../../../../socket-server/socket-auth-token';

/**
 * Mints a short-lived handshake auth token for the pairing socket. Called only from
 * the same-origin app (a Route Handler), where the next-auth session cookie is in
 * scope; the token then authenticates the browser to the separate socket host.
 * See `socket-server/socket-auth-token.ts`.
 */
export async function createScannerSocketToken(userId: string): Promise<string> {
  return signScannerSocketToken(userId);
}
