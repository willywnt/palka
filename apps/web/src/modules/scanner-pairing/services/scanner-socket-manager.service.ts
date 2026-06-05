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
import type { QueryClient } from '@tanstack/react-query';

import { useScannerPairingStore } from '../store/scanner-pairing.store';
import type { ActivePairingSessionResult, PairingSessionSummary } from '../types';
import { toPairingSessionSummaryFromEvent } from '../utils/session-from-event';
import { connectionStateFromSession } from '../utils/connection-state';
import { pairingQueryKeys } from '../hooks/use-pairing-api';

type BarcodeListener = (payload: BarcodeScannedServerPayload) => void;

let joinedPairingId: string | null = null;
let joinedRole: 'desktop' | 'mobile' | null = null;
let handlersAttached = false;
const barcodeListeners = new Set<BarcodeListener>();

const SOCKET_CONNECT_TIMEOUT_MS = 12_000;

let pairingQueryClient: QueryClient | null = null;

/** Lets the React layer hand its QueryClient to this non-React socket singleton. */
export function setPairingQueryClient(queryClient: QueryClient): void {
  pairingQueryClient = queryClient;
}

/**
 * Socket-driven session updates flow into the TanStack Query cache (the single
 * source of truth for the pairing session) and re-derive the UI connection state
 * in the store — which keeps only client/UI state.
 */
function applySessionEvent(payload: PairingSessionEventPayload): void {
  const partial = toPairingSessionSummaryFromEvent(payload);
  const queryClient = pairingQueryClient;

  const previousActive = queryClient?.getQueryData<ActivePairingSessionResult>(
    pairingQueryKeys.active,
  );
  const previousSession = queryClient?.getQueryData<PairingSessionSummary>(
    pairingQueryKeys.session(partial.id),
  );
  const current = previousActive?.session ?? previousSession ?? null;
  const merged: PairingSessionSummary = current ? { ...current, ...partial } : partial;

  if (queryClient) {
    queryClient.setQueryData<ActivePairingSessionResult>(pairingQueryKeys.active, {
      session: merged,
      connectUrl: previousActive?.connectUrl ?? null,
    });
    queryClient.setQueryData<PairingSessionSummary>(pairingQueryKeys.session(merged.id), merged);
  }

  useScannerPairingStore.getState().setConnectionState(connectionStateFromSession(merged));
}

function waitForSocketConnect(socket: ReturnType<typeof getScannerSocket>): Promise<void> {
  if (socket.connected) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      // Delegate so the hint is environment-aware (no dev:web mention in production).
      reject(new Error(formatScannerSocketError(new Error('socket timeout'))));
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

  // The station phase is driven authoritatively by the desktop via
  // STATION_RECORDING_STATE. We deliberately do NOT react to RECORDING_TRIGGERED
  // here: it would optimistically flip the phone into "countdown" on every scan,
  // even when the desktop then rejects the resi as a duplicate — leaving the phone
  // stuck. Letting the desktop report the real phase keeps the phone in sync.
  socket.on(
    scannerSocketEvents.server.STATION_RECORDING_STATE,
    (payload: { phase?: string; barcode?: string }) => {
      applyStationPhase(payload.phase, payload.barcode);
    },
  );

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
