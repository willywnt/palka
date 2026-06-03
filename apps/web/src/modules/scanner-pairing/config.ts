/** Pending session TTL before mobile connects (minutes). */
export const PAIRING_PENDING_TTL_MS = 10 * 60 * 1000;

/** Connected session extended TTL on each heartbeat (minutes). */
export const PAIRING_CONNECTED_TTL_MS = 30 * 60 * 1000;

/** Mobile heartbeat interval (ms). */
export const SCANNER_HEARTBEAT_INTERVAL_MS = 5_000;

/** Mark scanner disconnected if no heartbeat within (ms). */
export const SCANNER_HEARTBEAT_STALE_MS = 15_000;

/** Ignore duplicate barcode scans within (ms). */
export const BARCODE_SCAN_DEBOUNCE_MS = 2_000;

/** Auto-recording countdown seconds. */
export const RECORDING_COUNTDOWN_SECONDS = 3;

export const SOCKET_PATH = '/api/socket';

/**
 * Salt for the short-lived handshake auth token (encode/decode via next-auth/jwt).
 * Deliberately distinct from the session-cookie name so the socket handshake token
 * is decoupled from the cookie auth mechanism; mint and verify must share it.
 */
export const SOCKET_AUTH_TOKEN_SALT = 'olshop.scanner-socket.v1';

/** Lifetime of a handshake auth token (seconds). Refreshed on each (re)connect. */
export const SOCKET_AUTH_TOKEN_TTL_SECONDS = 120;

export const PAIRING_ROOM_PREFIX = 'pairing:';

export function pairingRoomId(sessionId: string): string {
  return `${PAIRING_ROOM_PREFIX}${sessionId}`;
}
