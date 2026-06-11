'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { playScanError, playScanSuccess } from '@/lib/scan-sound';
import { formatProductVariantLabel } from '@/lib/variant-label';
import { isMobileScannerEnabled } from '@/modules/scanner-pairing/config';
import { useDesktopScannerSocket } from '@/modules/scanner-pairing/hooks/use-desktop-scanner-socket';
import { useActivePairingQuery } from '@/modules/scanner-pairing/hooks/use-pairing-api';
import type { BarcodeScannedServerPayload } from '@/modules/scanner-pairing/socket/events';

import { useScanCountMutation } from './use-stock-opname';

/** Coarse state of the opname phone scanner, for the status indicator. */
export type OpnameScannerStatus = 'off' | 'idle' | 'waiting' | 'connected' | 'disconnected';

type UseOpnameScannerOptions = {
  opnameId: string;
  soundEnabled: boolean;
};

/**
 * Mobile + manual scan-to-count for an opname session — the same shared pairing
 * flow as POS/PO, but on an OPNAME pairing so a scan only drives the count station.
 * Every scan (phone or the manual field that calls `scan`) tallies +1 on the
 * matched variant, with an audible blip; an unmatched code buzzes an error.
 */
export function useOpnameScanner({ opnameId, soundEnabled }: UseOpnameScannerOptions): {
  scannerEnabled: boolean;
  status: OpnameScannerStatus;
  scan: (code: string) => Promise<void>;
  isScanning: boolean;
} {
  const scannerEnabled = isMobileScannerEnabled();
  const { data: activePairing } = useActivePairingQuery(scannerEnabled);
  const session =
    scannerEnabled && activePairing?.session?.purpose === 'OPNAME' ? activePairing.session : null;
  const scanMutation = useScanCountMutation(opnameId);

  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  async function scan(code: string): Promise<void> {
    const term = code.trim();
    if (!term) return;
    try {
      const result = await scanMutation.mutateAsync(term);
      if (!result.matched) {
        if (soundRef.current) playScanError();
        toast.warning('Produk tidak ditemukan', {
          description: `Kode ${term} gak cocok dengan SKU atau barcode mana pun.`,
        });
        return;
      }
      if (soundRef.current) playScanSuccess();
      toast.success(formatProductVariantLabel(result.matched.productName, result.matched), {
        description: `Dihitung: ${result.matched.countedQuantity}`,
      });
    } catch (error) {
      if (soundRef.current) playScanError();
      toast.error('Scan gagal', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  // Keep the socket handler pointed at the latest closure without re-subscribing.
  const scanRef = useRef(scan);
  scanRef.current = scan;
  function handleBarcodeScanned(payload: BarcodeScannedServerPayload): Promise<void> {
    return scanRef.current(payload.barcode);
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
      toast.warning('Scanner ponsel terputus', {
        description: 'Ponsel kamu offline. Buka ulang link scanner atau scan ulang QR-nya.',
      });
    }
  }, [sessionStatus]);

  const status: OpnameScannerStatus = !scannerEnabled
    ? 'off'
    : sessionStatus === 'CONNECTED'
      ? 'connected'
      : sessionStatus === 'PENDING'
        ? 'waiting'
        : dropped
          ? 'disconnected'
          : 'idle';

  return { scannerEnabled, status, scan, isScanning: scanMutation.isPending };
}
