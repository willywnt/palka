'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { playScanError, playScanSuccess } from '@/lib/scan-sound';
import { isMobileScannerEnabled } from '@/modules/scanner-pairing/config';
import { useDesktopScannerSocket } from '@/modules/scanner-pairing/hooks/use-desktop-scanner-socket';
import { useActivePairingQuery } from '@/modules/scanner-pairing/hooks/use-pairing-api';
import type { BarcodeScannedServerPayload } from '@/modules/scanner-pairing/socket/events';

import { useResolveVariantMutation } from './use-sales';
import type { SellableVariant } from '../types';

/** Coarse state of the POS phone scanner, for the till's status indicator. */
export type PosScannerStatus = 'off' | 'idle' | 'waiting' | 'connected' | 'disconnected';

type UsePosScannerOptions = {
  onResolved: (variant: SellableVariant) => void;
  soundEnabled: boolean;
};

type UsePosScannerResult = {
  /** Whether the mobile-scanner feature is surfaced (on in dev, gated off in prod). */
  scannerEnabled: boolean;
  status: PosScannerStatus;
};

/**
 * Bridges the shared scanner-pairing flow into the POS cart: a phone scans a
 * product QR label → the desktop receives the (normalized) code → it resolves to
 * a sellable variant → onResolved adds it to the cart, with an audible blip.
 * Reuses the recordings pairing socket as-is — POS only consumes the generic
 * `barcode_scanned` event (HARD CONSTRAINT #4 contracts untouched) and only acts
 * on a pairing whose purpose is POS.
 */
export function usePosScanner({
  onResolved,
  soundEnabled,
}: UsePosScannerOptions): UsePosScannerResult {
  const scannerEnabled = isMobileScannerEnabled();
  const { data: activePairing } = useActivePairingQuery(scannerEnabled);
  const session =
    scannerEnabled && activePairing?.session?.purpose === 'POS' ? activePairing.session : null;
  const resolve = useResolveVariantMutation();

  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  // useDesktopScannerSocket stores this in a ref, so a fresh closure each render
  // (latest onResolved / sound flag) is fine — no need to memoize.
  async function handleBarcodeScanned(payload: BarcodeScannedServerPayload): Promise<void> {
    try {
      const variant = await resolve.mutateAsync(payload.barcode);
      if (!variant) {
        if (soundRef.current) playScanError();
        toast.warning('No matching product', {
          description: `Code ${payload.barcode} didn't match any SKU or barcode.`,
        });
        return;
      }
      onResolved(variant);
      if (soundRef.current) playScanSuccess();
      toast.success('Added to cart', {
        description: `${variant.productName} · ${variant.name}`,
      });
    } catch (error) {
      if (soundRef.current) playScanError();
      toast.error('Scan failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  useDesktopScannerSocket(session?.id ?? null, handleBarcodeScanned);

  // Surface drops (phone closed the app, went idle, or lost network) so the
  // cashier isn't left wondering why scanning stopped.
  const wasConnectedRef = useRef(false);
  const [dropped, setDropped] = useState(false);
  const sessionStatus = session?.status ?? null;
  useEffect(() => {
    if (sessionStatus === 'CONNECTED') {
      wasConnectedRef.current = true;
      setDropped(false);
    } else if (wasConnectedRef.current && sessionStatus !== 'PENDING') {
      wasConnectedRef.current = false;
      setDropped(true);
      toast.warning('Phone scanner disconnected', {
        description: 'The phone went offline. Reopen the scanner link or rescan the QR.',
      });
    }
  }, [sessionStatus]);

  const status: PosScannerStatus = !scannerEnabled
    ? 'off'
    : sessionStatus === 'CONNECTED'
      ? 'connected'
      : sessionStatus === 'PENDING'
        ? 'waiting'
        : dropped
          ? 'disconnected'
          : 'idle';

  return { scannerEnabled, status };
}
