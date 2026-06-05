'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { playScanError, playScanSuccess } from '@/lib/scan-sound';
import { isMobileScannerEnabled } from '@/modules/scanner-pairing/config';
import { useDesktopScannerSocket } from '@/modules/scanner-pairing/hooks/use-desktop-scanner-socket';
import { useActivePairingQuery } from '@/modules/scanner-pairing/hooks/use-pairing-api';
import type { BarcodeScannedServerPayload } from '@/modules/scanner-pairing/socket/events';

import { useResolvePurchaseVariantMutation } from './use-purchase-orders';
import type { PurchasableVariant } from '../types';

/** Coarse state of the PO phone scanner, for the status indicator. */
export type PoScannerStatus = 'off' | 'idle' | 'waiting' | 'connected' | 'disconnected';

type UsePurchaseScannerOptions = {
  onResolved: (variant: PurchasableVariant) => void;
  soundEnabled: boolean;
};

/**
 * Mobile scan-to-order for the New Purchase Order page — the same shared pairing
 * flow as POS, but on a PURCHASING pairing so it never collides with a POS or
 * recordings phone. A scanned code resolves to a variant → onResolved adds/bumps
 * the PO line, with an audible blip.
 */
export function usePurchaseScanner({ onResolved, soundEnabled }: UsePurchaseScannerOptions): {
  scannerEnabled: boolean;
  status: PoScannerStatus;
} {
  const scannerEnabled = isMobileScannerEnabled();
  const { data: activePairing } = useActivePairingQuery(scannerEnabled);
  const session =
    scannerEnabled && activePairing?.session?.purpose === 'PURCHASING'
      ? activePairing.session
      : null;
  const resolve = useResolvePurchaseVariantMutation();

  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

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
      toast.success('Added to order', {
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

  // Surface drops (phone closed the app, went idle, or lost network).
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

  const status: PoScannerStatus = !scannerEnabled
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
