'use client';

import { io, type Socket } from 'socket.io-client';

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

function resolveSocketUrl(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
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
