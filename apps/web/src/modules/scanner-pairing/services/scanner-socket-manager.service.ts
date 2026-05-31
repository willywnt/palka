'use client';

import {
  disconnectScannerSocket,
  emitJoinPairing,
  formatScannerSocketError,
  getScannerSocket,
  scannerSocketEvents,
  type BarcodeScannedServerPayload,
  type PairingSessionEventPayload,
} from './socket-client.service';
import { useScannerPairingStore } from '../store/scanner-pairing.store';
import type { PairingSessionSummary } from '../types';
import { toPairingSessionSummaryFromEvent } from '../utils/session-from-event';

type BarcodeListener = (payload: BarcodeScannedServerPayload) => void;

let joinedPairingId: string | null = null;
let joinedRole: 'desktop' | 'mobile' | null = null;
let handlersAttached = false;
const barcodeListeners = new Set<BarcodeListener>();

const SOCKET_CONNECT_TIMEOUT_MS = 12_000;

function applySessionEvent(payload: PairingSessionEventPayload): void {
  const partial = toPairingSessionSummaryFromEvent(payload);
  const current = useScannerPairingStore.getState().session;
  useScannerPairingStore
    .getState()
    .setSession(
      current
        ? { ...current, ...partial, status: partial.status as PairingSessionSummary['status'] }
        : partial,
    );
}

function waitForSocketConnect(socket: ReturnType<typeof getScannerSocket>): Promise<void> {
  if (socket.connected) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          'Could not reach the recording station (socket timeout). Restart with pnpm dev:web.',
        ),
      );
    }, SOCKET_CONNECT_TIMEOUT_MS);

    const onConnect = () => {
      cleanup();
      resolve();
    };

    const onConnectError = (error: Error) => {
      cleanup();
      reject(new Error(formatScannerSocketError(error)));
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
    };

    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.connect();
  });
}

async function joinPairingRoom(pairingId: string, role: 'desktop' | 'mobile'): Promise<void> {
  const socket = getScannerSocket();
  const ack = await emitJoinPairing(socket, { pairingId, role });
  if (!ack.ok) {
    throw new Error(ack.error?.message ?? 'Failed to join pairing session');
  }
}

function ensureSocketHandlers(): void {
  if (handlersAttached) return;

  const socket = getScannerSocket();

  socket.on('connect', () => {
    useScannerPairingStore.getState().setSocketConnected(true);
    void rejoinIfNeeded();
  });

  socket.on('disconnect', () => {
    useScannerPairingStore.getState().setSocketConnected(false);
  });

  socket.on(scannerSocketEvents.server.PAIRING_CONNECTED, (payload: PairingSessionEventPayload) => {
    applySessionEvent(payload);
    useScannerPairingStore.getState().setConnectionState('connected');
  });

  socket.on(
    scannerSocketEvents.server.PAIRING_DISCONNECTED,
    (payload: PairingSessionEventPayload) => {
      applySessionEvent(payload);
      useScannerPairingStore.getState().setConnectionState('disconnected');
    },
  );

  socket.on(scannerSocketEvents.server.PAIRING_EXPIRED, () => {
    useScannerPairingStore.getState().setConnectionState('expired');
  });

  socket.on(scannerSocketEvents.server.BARCODE_SCANNED, (payload: BarcodeScannedServerPayload) => {
    useScannerPairingStore.getState().setLastScan({
      barcode: payload.barcode,
      scannedAt: payload.scannedAt,
    });
    for (const listener of barcodeListeners) {
      listener(payload);
    }
  });

  socket.on(scannerSocketEvents.server.SESSION_STATE, applySessionEvent);

  const applyStationPhase = (phase: string | undefined, barcode?: string) => {
    if (
      phase === 'idle' ||
      phase === 'countdown' ||
      phase === 'recording' ||
      phase === 'uploading'
    ) {
      useScannerPairingStore.getState().setStationRecordingState(phase, barcode ?? null);
    }
  };

  socket.on(
    scannerSocketEvents.server.STATION_RECORDING_STATE,
    (payload: { phase?: string; barcode?: string }) => {
      applyStationPhase(payload.phase, payload.barcode);
    },
  );

  socket.on(scannerSocketEvents.server.RECORDING_TRIGGERED, (payload: { barcode?: string }) => {
    if (payload.barcode) {
      applyStationPhase('countdown', payload.barcode);
    }
  });

  handlersAttached = true;
}

async function rejoinIfNeeded(): Promise<void> {
  if (!joinedPairingId || !joinedRole) return;
  try {
    await joinPairingRoom(joinedPairingId, joinedRole);
  } catch {
    joinedPairingId = null;
    joinedRole = null;
  }
}

export function subscribeScannerBarcode(listener: BarcodeListener): () => void {
  barcodeListeners.add(listener);
  return () => {
    barcodeListeners.delete(listener);
  };
}

export async function connectScannerPairing(
  pairingId: string,
  role: 'desktop' | 'mobile',
): Promise<void> {
  ensureSocketHandlers();

  joinedPairingId = pairingId;
  joinedRole = role;

  const socket = getScannerSocket();
  await waitForSocketConnect(socket);
  await joinPairingRoom(pairingId, role);
  useScannerPairingStore.getState().setSocketConnected(true);
  useScannerPairingStore.getState().setConnectionState('connected');

  if (role === 'mobile') {
    socket.emit(scannerSocketEvents.client.SCANNER_HEARTBEAT, { pairingId });
  }
}

/** Re-join after reconnect without calling the HTTP connect API again. */
export async function reconnectScannerPairingSocket(
  pairingId: string,
  role: 'desktop' | 'mobile',
): Promise<void> {
  ensureSocketHandlers();
  joinedPairingId = pairingId;
  joinedRole = role;

  const socket = getScannerSocket();
  if (!socket.connected) {
    await waitForSocketConnect(socket);
  }
  await joinPairingRoom(pairingId, role);
  useScannerPairingStore.getState().setSocketConnected(true);
  useScannerPairingStore.getState().setConnectionState('connected');
}

export function disconnectScannerPairing(): void {
  const socket = getScannerSocket();
  if (joinedPairingId) {
    socket.emit(scannerSocketEvents.client.DISCONNECT_PAIRING, { pairingId: joinedPairingId });
  }
  socket.emit(scannerSocketEvents.client.LEAVE_PAIRING);
  joinedPairingId = null;
  joinedRole = null;
  disconnectScannerSocket();
  handlersAttached = false;
  useScannerPairingStore.getState().setSocketConnected(false);
}
