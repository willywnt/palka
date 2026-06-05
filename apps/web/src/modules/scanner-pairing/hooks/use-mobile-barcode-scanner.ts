'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BarcodeFormat, BrowserMultiFormatReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import type { Result } from '@zxing/library';

import { playScanSuccess } from '@/lib/scan-sound';

import { PAIRING_ERROR_MESSAGES, PAIRING_ERROR_CODES } from '../errors/pairing-errors';
import { emitBarcodeScanned, getScannerSocket } from '../services/socket-client.service';
import { boundsFromResultPoints, type BarcodeOverlayBounds } from '../utils/barcode-overlay-bounds';
import { getCameraUnavailableMessage, isCameraApiAvailable } from '../utils/camera-environment';
import { scannedCodeSchema } from '../validators/pairing';
import type { MobileScanHistoryEntry } from '../components/mobile-scan-history';

// QR_CODE first for the POS product labels (printed via the label studio); the
// rest are the 1D logistics symbologies used by packing/recordings shipping labels.
const SUPPORTED_SCAN_FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
];

const MAX_SCAN_HISTORY = 30;
// How long with no decode before the detection highlight is hidden (visual only).
const DETECTION_CLEAR_MS = 350;
// How long a code must be ABSENT before the same code may fire again. Longer than
// the highlight clear so brief decode flicker on a steady barcode never re-fires it.
const REARM_AFTER_GAP_MS = 1200;

type UseMobileBarcodeScannerOptions = {
  pairingId: string | null;
  enabled: boolean;
  onScanSuccess?: (barcode: string) => void;
};

export function useMobileBarcodeScanner({
  pairingId,
  enabled,
  onScanSuccess,
}: UseMobileBarcodeScannerOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  // The code currently held in frame — used to debounce the continuous decode
  // stream WITHOUT blocking a deliberate re-scan: it stays set while the barcode
  // keeps decoding and only re-arms after REARM_AFTER_GAP_MS of no decode.
  const inFrameCodeRef = useRef<string | null>(null);
  const scanSeqRef = useRef(0);
  const detectionClearTimerRef = useRef<number | null>(null);
  const rearmTimerRef = useRef<number | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [barcodeDetected, setBarcodeDetected] = useState(false);
  const [detectionBounds, setDetectionBounds] = useState<BarcodeOverlayBounds | null>(null);
  const [previewBarcode, setPreviewBarcode] = useState<string | null>(null);
  const [scanHistory, setScanHistory] = useState<MobileScanHistoryEntry[]>([]);

  const clearDetectionHighlight = useCallback(() => {
    if (detectionClearTimerRef.current !== null) {
      window.clearTimeout(detectionClearTimerRef.current);
      detectionClearTimerRef.current = null;
    }
    setBarcodeDetected(false);
    setDetectionBounds(null);
    setPreviewBarcode(null);
  }, []);

  const markBarcodeDetected = useCallback(
    (result: Result) => {
      const points = result.getResultPoints?.() ?? [];
      const bounds = boundsFromResultPoints(
        points.length > 0 ? points : undefined,
        videoRef.current,
        containerRef.current,
      );
      setDetectionBounds(bounds);
      setBarcodeDetected(true);
      setPreviewBarcode(result.getText().trim());

      if (detectionClearTimerRef.current !== null) {
        window.clearTimeout(detectionClearTimerRef.current);
      }
      detectionClearTimerRef.current = window.setTimeout(() => {
        clearDetectionHighlight();
      }, DETECTION_CLEAR_MS);

      // Keep the in-frame code "held" while it keeps decoding; only a sustained
      // absence (not brief flicker) re-arms it for another scan.
      if (rearmTimerRef.current !== null) {
        window.clearTimeout(rearmTimerRef.current);
      }
      rearmTimerRef.current = window.setTimeout(() => {
        inFrameCodeRef.current = null;
      }, REARM_AFTER_GAP_MS);
    },
    [clearDetectionHighlight],
  );

  const pushScanHistory = useCallback((barcode: string) => {
    scanSeqRef.current += 1;
    const entry: MobileScanHistoryEntry = {
      id: `${Date.now()}-${scanSeqRef.current}`,
      barcode,
      scannedAt: new Date().toISOString(),
    };
    // Every scan is its own entry — re-scanning the same code logs it again.
    setScanHistory((prev) => [entry, ...prev].slice(0, MAX_SCAN_HISTORY));
  }, []);

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    readerRef.current = null;
    setIsScanning(false);
    if (rearmTimerRef.current !== null) {
      window.clearTimeout(rearmTimerRef.current);
      rearmTimerRef.current = null;
    }
    inFrameCodeRef.current = null;
    clearDetectionHighlight();
  }, [clearDetectionHighlight]);

  const startScanner = useCallback(async () => {
    if (!enabled || !pairingId || !videoRef.current) return;

    setCameraError(null);
    stopScanner();

    const blocked = getCameraUnavailableMessage();
    if (blocked) {
      setCameraError(blocked);
      return;
    }

    const reader = new BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 200,
    });
    reader.possibleFormats = SUPPORTED_SCAN_FORMATS;
    readerRef.current = reader;

    try {
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        async (result, error) => {
          if (!result) {
            if (error && error.name !== 'NotFoundException') {
              // Ignore frame-level decode misses.
            }
            return;
          }

          markBarcodeDetected(result);

          // Emit the scanned code verbatim (just trimmed) — no uppercasing or
          // whitespace stripping, so a SKU/barcode matches its stored value exactly.
          const parsed = scannedCodeSchema.safeParse(result.getText());
          if (!parsed.success) return;
          const code = parsed.data;

          // Fire once per appearance: skip the continuous decode of the code that
          // is still in frame, but allow it again after it leaves (re-armed in
          // clearDetectionHighlight) so deliberate re-scans always register.
          if (inFrameCodeRef.current === code) return;
          inFrameCodeRef.current = code;

          const socket = getScannerSocket();
          if (!socket.connected) {
            inFrameCodeRef.current = null;
            return;
          }

          const ack = await emitBarcodeScanned(socket, pairingId, code);
          if (ack.ok) {
            pushScanHistory(code);
            onScanSuccess?.(code);
            playScanSuccess();
          }
        },
      );
      controlsRef.current = controls;
      setIsScanning(true);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Failed to start camera';
      const needsHttps =
        rawMessage.includes('getUserMedia') ||
        rawMessage.includes('mediaDevices') ||
        !isCameraApiAvailable();

      const message =
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? PAIRING_ERROR_MESSAGES[PAIRING_ERROR_CODES.CAMERA_PERMISSION_DENIED]
          : needsHttps
            ? (getCameraUnavailableMessage() ?? rawMessage)
            : rawMessage;

      setCameraError(message);
      stopScanner();
    }
  }, [enabled, markBarcodeDetected, onScanSuccess, pairingId, pushScanHistory, stopScanner]);

  useEffect(() => {
    if (enabled && pairingId) {
      void startScanner();
    } else {
      stopScanner();
    }

    return () => stopScanner();
  }, [enabled, pairingId, startScanner, stopScanner]);

  useEffect(() => {
    return () => {
      if (detectionClearTimerRef.current !== null) {
        window.clearTimeout(detectionClearTimerRef.current);
      }
      if (rearmTimerRef.current !== null) {
        window.clearTimeout(rearmTimerRef.current);
      }
    };
  }, []);

  return {
    videoRef,
    containerRef,
    cameraError,
    isScanning,
    barcodeDetected,
    detectionBounds,
    previewBarcode,
    scanHistory,
    retryCamera: () => void startScanner(),
  };
}
