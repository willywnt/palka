'use client';

import { useEffect, useRef } from 'react';

import { useAnotherTabRecording } from '@/modules/recordings/recovery/hooks/use-another-tab-recording';
import { useRecordingReliabilityStore } from '@/modules/recordings/recovery/store/recording-reliability.store';
import {
  selectIsRecordingBusy,
  useRecordingStore,
} from '@/modules/recordings/store/recording.store';

import type { StationRecordingPhase } from '../socket/events';
import { emitReportStationState, getScannerSocket } from '../services/socket-client.service';
import { useScannerPairingStore } from '../store/scanner-pairing.store';

function resolveStationPhase(
  countdownOpen: boolean,
  status: string,
  isBusy: boolean,
  isRetryingUpload: boolean,
): StationRecordingPhase {
  if (countdownOpen) return 'countdown';
  if (status === 'RECORDING' || isBusy) return 'recording';
  if (status === 'UPLOADING' || isRetryingUpload) return 'uploading';
  return 'idle';
}

/** Broadcasts desktop recording lifecycle to the paired mobile scanner. */
export function useDesktopStationRecordingSync(pairingId: string | null): void {
  const countdownOpen = useScannerPairingStore((s) => s.countdownOpen);
  const countdownBarcode = useScannerPairingStore((s) => s.countdownBarcode);
  const status = useRecordingStore((s) => s.status);
  const noResi = useRecordingStore((s) => s.noResi);
  const isBusy = useRecordingStore(selectIsRecordingBusy);
  const isRetryingUpload = useRecordingReliabilityStore((s) => s.isRetryingUpload);
  const anotherTabRecording = useAnotherTabRecording();

  const lastSentRef = useRef<string>('');

  useEffect(() => {
    if (!pairingId || anotherTabRecording) return;

    const phase = resolveStationPhase(countdownOpen, status, isBusy, isRetryingUpload);
    const barcode =
      phase === 'idle' ? undefined : (countdownBarcode ?? (noResi.trim() || undefined));

    const signature = `${phase}:${barcode ?? ''}`;
    if (lastSentRef.current === signature) return;
    lastSentRef.current = signature;

    const socket = getScannerSocket();
    if (!socket.connected) return;

    void emitReportStationState(socket, {
      pairingId,
      phase,
      barcode,
    });

    useScannerPairingStore.getState().setStationRecordingState(phase, barcode ?? null);
  }, [
    anotherTabRecording,
    countdownBarcode,
    countdownOpen,
    isBusy,
    isRetryingUpload,
    noResi,
    pairingId,
    status,
  ]);
}
