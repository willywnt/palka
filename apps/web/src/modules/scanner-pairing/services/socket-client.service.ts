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

/** User-facing hint when Engine.IO polling fails (wrong server, cert, or not using dev:web). */
export function formatScannerSocketError(error: Error): string {
  const message = error.message.toLowerCase();

  if (message.includes('xhr poll') || message.includes('polling')) {
    return 'Cannot reach the scanner socket. Use pnpm dev:web (not next dev), accept the HTTPS certificate on this phone, and open the same URL as the QR code.';
  }

  if (message.includes('websocket')) {
    return 'WebSocket connection failed. Check Wi‑Fi and that the PC dev server is still running.';
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
