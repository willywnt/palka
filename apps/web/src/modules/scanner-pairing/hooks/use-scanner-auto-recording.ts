'use client';

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { playCountdownGo, playCountdownTick } from '@/lib/scan-sound';
import { useAnotherTabRecording } from '@/modules/recordings/recovery/hooks/use-another-tab-recording';
import { recoverDefaultCameraPreview } from '@/modules/recordings/recovery/utils/camera-stream';
import { useRecordingReliabilityStore } from '@/modules/recordings/recovery/store/recording-reliability.store';
import { useDuplicateResiWarning } from '@/modules/recordings/hooks/use-duplicate-resi-warning';
import {
  selectIsRecordingBusy,
  useRecordingStore,
} from '@/modules/recordings/store/recording.store';

import { PAIRING_ERROR_MESSAGES, PAIRING_ERROR_CODES } from '../errors/pairing-errors';
import { RECORDING_COUNTDOWN_SECONDS } from '../config';
import type { BarcodeScannedServerPayload } from '../services/socket-client.service';
import { useScannerPairingStore } from '../store/scanner-pairing.store';

type UseScannerAutoRecordingOptions = {
  setNoResi: (value: string) => void;
  startRecording: (noResiOverride?: string) => Promise<void>;
  canStart: boolean;
};

export function useScannerAutoRecording({
  setNoResi,
  startRecording,
  canStart,
}: UseScannerAutoRecordingOptions) {
  const countdownTimerRef = useRef<number | null>(null);
  const pendingStartRef = useRef(false);
  const pendingCountdownBarcodeRef = useRef<string | null>(null);

  const openCountdown = useScannerPairingStore((s) => s.openCountdown);
  const closeCountdown = useScannerPairingStore((s) => s.closeCountdown);
  const setCountdownSeconds = useScannerPairingStore((s) => s.setCountdownSeconds);
  const setBlockReason = useScannerPairingStore((s) => s.setBlockReason);
  const countdownOpen = useScannerPairingStore((s) => s.countdownOpen);

  const { duplicateWarning, checkDuplicate, clearDuplicateWarning } = useDuplicateResiWarning();

  const anotherTabRecording = useAnotherTabRecording();
  const recoveryModalOpen = useRecordingReliabilityStore((s) => s.recoveryModalOpen);
  const isRetryingUpload = useRecordingReliabilityStore((s) => s.isRetryingUpload);
  const webcamDisconnected = useRecordingReliabilityStore((s) => s.webcamDisconnected);
  const status = useRecordingStore((s) => s.status);
  const isBusy = useRecordingStore(selectIsRecordingBusy);

  const clearCountdownTimer = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const evaluateBlockReason = useCallback((): string | null => {
    if (recoveryModalOpen) {
      return PAIRING_ERROR_MESSAGES[PAIRING_ERROR_CODES.RECOVERY_MODAL_ACTIVE];
    }
    if (status === 'UPLOADING' || isRetryingUpload) {
      return PAIRING_ERROR_MESSAGES[PAIRING_ERROR_CODES.UPLOAD_IN_PROGRESS];
    }
    if (isBusy || status === 'RECORDING') {
      return PAIRING_ERROR_MESSAGES[PAIRING_ERROR_CODES.RECORDING_ALREADY_ACTIVE];
    }
    if (anotherTabRecording) {
      return PAIRING_ERROR_MESSAGES[PAIRING_ERROR_CODES.TAB_LOCK_CONFLICT];
    }
    if (webcamDisconnected) {
      return PAIRING_ERROR_MESSAGES[PAIRING_ERROR_CODES.WEBCAM_UNAVAILABLE];
    }
    if (!canStart) {
      return PAIRING_ERROR_MESSAGES[PAIRING_ERROR_CODES.RECORDING_ALREADY_ACTIVE];
    }
    return null;
  }, [
    anotherTabRecording,
    canStart,
    isBusy,
    isRetryingUpload,
    recoveryModalOpen,
    status,
    webcamDisconnected,
  ]);

  const runCountdown = useCallback(
    (barcode: string) => {
      clearCountdownTimer();
      openCountdown(barcode);
      let remaining = RECORDING_COUNTDOWN_SECONDS;
      setCountdownSeconds(remaining);
      setBlockReason(null);
      playCountdownTick();

      countdownTimerRef.current = window.setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearCountdownTimer();
          closeCountdown();
          playCountdownGo();
          if (pendingStartRef.current) {
            pendingStartRef.current = false;
            const resi = useScannerPairingStore.getState().countdownBarcode;
            void startRecording(resi ?? undefined);
          }
          return;
        }
        setCountdownSeconds(remaining);
        playCountdownTick();
      }, 1000);
    },
    [
      clearCountdownTimer,
      closeCountdown,
      openCountdown,
      setBlockReason,
      setCountdownSeconds,
      startRecording,
    ],
  );

  const beginCountdownAfterChecks = useCallback(
    (barcode: string) => {
      const blockReason = evaluateBlockReason();
      if (blockReason) {
        setBlockReason(blockReason);
        toast.warning('Cannot auto-start recording', { description: blockReason });
        return;
      }

      pendingStartRef.current = true;
      runCountdown(barcode);
    },
    [evaluateBlockReason, runCountdown, setBlockReason],
  );

  const handleBarcodeScanned = useCallback(
    async (payload: BarcodeScannedServerPayload) => {
      const barcode = payload.barcode.trim();
      setNoResi(barcode);

      await recoverDefaultCameraPreview();

      const isDuplicate = await checkDuplicate(barcode);
      if (isDuplicate) {
        pendingCountdownBarcodeRef.current = barcode;
        return;
      }

      beginCountdownAfterChecks(barcode);
    },
    [beginCountdownAfterChecks, checkDuplicate, setNoResi],
  );

  const cancelCountdown = useCallback(() => {
    clearCountdownTimer();
    closeCountdown();
    pendingStartRef.current = false;
    pendingCountdownBarcodeRef.current = null;
    useScannerPairingStore.getState().setStationRecordingState('idle', null);
  }, [clearCountdownTimer, closeCountdown]);

  const startCountdownNow = useCallback(() => {
    const barcode = useScannerPairingStore.getState().countdownBarcode;
    if (!barcode) return;

    clearCountdownTimer();
    pendingStartRef.current = true;
    void startRecording(barcode);
    closeCountdown();
  }, [clearCountdownTimer, closeCountdown, startRecording]);

  const confirmScannerDuplicateAndCountdown = useCallback(() => {
    const barcode = pendingCountdownBarcodeRef.current ?? duplicateWarning?.noResi ?? null;
    clearDuplicateWarning();
    pendingCountdownBarcodeRef.current = null;

    if (!barcode) return;
    beginCountdownAfterChecks(barcode);
  }, [beginCountdownAfterChecks, clearDuplicateWarning, duplicateWarning?.noResi]);

  const clearScannerDuplicateWarning = useCallback(() => {
    pendingCountdownBarcodeRef.current = null;
    clearDuplicateWarning();
  }, [clearDuplicateWarning]);

  useEffect(() => {
    return () => clearCountdownTimer();
  }, [clearCountdownTimer]);

  return {
    handleBarcodeScanned,
    cancelCountdown,
    startCountdownNow,
    countdownOpen,
    scannerDuplicateWarning: duplicateWarning,
    clearScannerDuplicateWarning,
    confirmScannerDuplicateAndCountdown,
  };
}
