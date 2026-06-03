'use client';

import { io, type Socket } from 'socket.io-client';

import { apiFetch } from '@/lib/api/fetch-client';
import { apiRoutes } from '@/lib/api/routes';

import { SOCKET_PATH } from '../config';
import {
  CLIENT_SOCKET_EVENTS,
  SERVER_SOCKET_EVENTS,
  type BarcodeAckPayload,
  type BarcodeScannedServerPayload,
  type JoinPairingPayload,
  type PairingSessionEventPayload,
  type ReportStationStatePayload,
  type SocketAckResponse,
} from '../socket/events';

let socketInstance: Socket | null = null;

/**
 * Where the pairing Socket.IO server lives. In production the realtime server
 * must run as a separate always-on host (a Vercel serverless function cannot
 * hold the persistent Engine.IO connection), so point the client at
 * NEXT_PUBLIC_SOCKET_URL when it is set; otherwise fall back to the same origin
 * (the custom Node server used in local dev via `pnpm dev:web`).
 */
function resolveSocketUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

/** A separate socket host is configured → it is cross-origin, so use token auth. */
function usesCrossOriginSocketHost(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SOCKET_URL?.trim());
}

/**
 * Fetch a short-lived handshake auth token from the app origin. The request is
 * same-origin to the app (relative path), so the session cookie is sent and the
 * server can mint a token. Returns null on any failure so the connection attempt
 * still proceeds (and fails auth cleanly) rather than hanging.
 */
async function fetchScannerSocketToken(): Promise<string | null> {
  try {
    const result = await apiFetch<{ token: string }>(`${apiRoutes.scannerPairing}/socket-token`);
    return result.success ? result.data.token : null;
  } catch {
    return null;
  }
}

/** socket.io-client `auth` provider: re-invoked on every (re)connect for a fresh token. */
function provideHandshakeAuth(cb: (data: object) => void): void {
  void fetchScannerSocketToken().then((token) => cb(token ? { token } : {}));
}

function attachConnectErrorLogger(socket: Socket): void {
  if ((socket as Socket & { __connectErrorHook?: boolean }).__connectErrorHook) {
    return;
  }
  (socket as Socket & { __connectErrorHook?: boolean }).__connectErrorHook = true;

  socket.on('connect_error', (error) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[scanner-socket] connect_error', error.message);
    }
  });
}

/**
 * User-facing hint when the realtime connection fails. The likely cause — and the
 * advice — differs by environment: local dev talks to the same-origin custom server
 * (cert / dev:web / Wi‑Fi), whereas production talks to a separate socket host over
 * the internet. The dev-only hints ("pnpm dev:web", "PC dev server") must NOT surface
 * in production, where they are misleading.
 */
export function formatScannerSocketError(error: Error): string {
  const message = error.message.toLowerCase();
  const isTransportError =
    message.includes('xhr poll') ||
    message.includes('polling') ||
    message.includes('websocket') ||
    message.includes('timeout');

  // Production: a separate socket host is configured, reached over the internet.
  if (usesCrossOriginSocketHost()) {
    return isTransportError
      ? 'Cannot reach the recording server. Check your connection and try again — the realtime service may be temporarily unavailable.'
      : error.message || 'Socket connection failed';
  }

  // Local dev: the socket is the same-origin custom server (pnpm dev:web).
  if (message.includes('xhr poll') || message.includes('polling')) {
    return 'Cannot reach the scanner socket. Use pnpm dev:web (not next dev), accept the HTTPS certificate on this phone, and open the same URL as the QR code.';
  }

  if (message.includes('websocket')) {
    return 'WebSocket connection failed. Check Wi‑Fi and that the PC dev server is still running.';
  }

  if (message.includes('timeout')) {
    return 'Could not reach the recording station (socket timeout). Restart with pnpm dev:web.';
  }

  return error.message || 'Socket connection failed';
}

export function getScannerSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(resolveSocketUrl(), {
      path: SOCKET_PATH,
      autoConnect: false,
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 12,
      reconnectionDelay: 800,
      timeout: 20_000,
      // Cross-origin host: authenticate via a short-lived handshake token (the cookie
      // is not sent cross-origin). Same-origin dev keeps the cookie (no auth provider).
      ...(usesCrossOriginSocketHost() ? { auth: provideHandshakeAuth } : {}),
    });
    attachConnectErrorLogger(socketInstance);
  }
  return socketInstance;
}

export function disconnectScannerSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance.removeAllListeners();
    socketInstance = null;
  }
}

export const scannerSocketEvents = {
  client: CLIENT_SOCKET_EVENTS,
  server: SERVER_SOCKET_EVENTS,
} as const;

export type ScannerSocket = Socket;

export async function emitJoinPairing(
  socket: Socket,
  payload: JoinPairingPayload,
): Promise<SocketAckResponse> {
  return new Promise((resolve) => {
    socket.emit(CLIENT_SOCKET_EVENTS.JOIN_PAIRING, payload, (response: SocketAckResponse) => {
      resolve(response ?? { ok: false, error: { code: 'UNKNOWN', message: 'No response' } });
    });
  });
}

export async function emitReportStationState(
  socket: Socket,
  payload: ReportStationStatePayload,
): Promise<SocketAckResponse> {
  return new Promise((resolve) => {
    socket.emit(
      CLIENT_SOCKET_EVENTS.REPORT_STATION_STATE,
      payload,
      (response: SocketAckResponse) => {
        resolve(response ?? { ok: false, error: { code: 'UNKNOWN', message: 'No response' } });
      },
    );
  });
}

export async function emitBarcodeScanned(
  socket: Socket,
  pairingId: string,
  barcode: string,
): Promise<SocketAckResponse<BarcodeAckPayload>> {
  return new Promise((resolve) => {
    socket.emit(
      CLIENT_SOCKET_EVENTS.BARCODE_SCANNED,
      { pairingId, barcode },
      (response: SocketAckResponse<BarcodeAckPayload>) => {
        resolve(response ?? { ok: false, error: { code: 'UNKNOWN', message: 'No response' } });
      },
    );
  });
}

export type { BarcodeAckPayload, BarcodeScannedServerPayload, PairingSessionEventPayload };
