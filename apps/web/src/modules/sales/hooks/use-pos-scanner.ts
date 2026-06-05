'use client';

import { toast } from 'sonner';

import { isMobileScannerEnabled } from '@/modules/scanner-pairing/config';
import { useDesktopScannerSocket } from '@/modules/scanner-pairing/hooks/use-desktop-scanner-socket';
import { useActivePairingQuery } from '@/modules/scanner-pairing/hooks/use-pairing-api';
import type { BarcodeScannedServerPayload } from '@/modules/scanner-pairing/socket/events';

import { useResolveVariantMutation } from './use-sales';
import type { SellableVariant } from '../types';

type UsePosScannerResult = {
  /** Whether the mobile-scanner feature is surfaced (on in dev, gated off in prod). */
  scannerEnabled: boolean;
  /** True once a phone is paired and connected to this till. */
  isConnected: boolean;
};

/**
 * Bridges the shared scanner-pairing flow into the POS cart: a phone scans a
 * product QR label → the desktop receives the (normalized) code → it resolves to
 * a sellable variant → onResolved adds it to the cart. Reuses the recordings
 * pairing socket as-is — POS only consumes the generic `barcode_scanned` event,
 * leaving HARD CONSTRAINT #4's event contracts untouched.
 */
export function usePosScanner(onResolved: (variant: SellableVariant) => void): UsePosScannerResult {
  const scannerEnabled = isMobileScannerEnabled();
  const { data: activePairing } = useActivePairingQuery(scannerEnabled);
  // Only act on a phone paired for POS — a recordings pairing must not add to cart.
  const pairingSession =
    scannerEnabled && activePairing?.session?.purpose === 'POS' ? activePairing.session : null;
  const resolve = useResolveVariantMutation();

  // useDesktopScannerSocket stores this in a ref, so a fresh closure each render
  // is fine — no need to memoize.
  async function handleBarcodeScanned(payload: BarcodeScannedServerPayload): Promise<void> {
    try {
      const variant = await resolve.mutateAsync(payload.barcode);
      if (!variant) {
        toast.warning('No matching product', {
          description: `Code ${payload.barcode} didn't match any SKU or barcode.`,
        });
        return;
      }
      onResolved(variant);
      toast.success('Added to cart', {
        description: `${variant.productName} · ${variant.name}`,
      });
    } catch (error) {
      toast.error('Scan failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  useDesktopScannerSocket(pairingSession?.id ?? null, handleBarcodeScanned);

  return {
    scannerEnabled,
    isConnected: pairingSession?.status === 'CONNECTED',
  };
}
