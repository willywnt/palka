'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useCallback, useRef } from 'react';
import { Loader2, ScanLine, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import type { PairingPurpose } from '@prisma/client';

import { Button } from '@/components/ui/button';
import { BarcodeDetectionOverlay } from './barcode-detection-overlay';
import { MobileScanHistory } from './mobile-scan-history';
import { MobileStationBusyOverlay } from './mobile-station-busy-overlay';
import { useMobileBarcodeScanner } from '../hooks/use-mobile-barcode-scanner';
import { useMobileHeartbeat } from '../hooks/use-mobile-heartbeat';
import { useMobilePairingConnect } from '../hooks/use-mobile-pairing-connect';
import { useMobilePairingQrAuth } from '../hooks/use-mobile-pairing-qr-auth';
import { useScannerPairingStore } from '../store/scanner-pairing.store';
import { stationPurposeMeta } from '../station-purpose';
import { getSuggestedSecureOrigin } from '../utils/camera-environment';

type MobileScannerViewProps = {
  pairingId: string | null;
  pairingCode: string | null;
  /** Station purpose from the scanned QR — shows the right copy before the session loads. */
  purpose: PairingPurpose | null;
  loginHref: string;
};

function CenteredMessage({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      {icon}
      <div className="space-y-2">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-muted-foreground max-w-xs text-sm">{description}</p>
      </div>
      {action}
    </main>
  );
}

export function MobileScannerView({
  pairingId,
  pairingCode,
  purpose,
  loginHref,
}: MobileScannerViewProps) {
  const { isAuthenticated, isAuthLoading, isClaiming, claimError, retryClaim } =
    useMobilePairingQrAuth({
      pairingId,
      pairingCode,
    });

  const { phase, errorMessage, retry, isReconnecting, session } = useMobilePairingConnect({
    pairingId,
    isAuthenticated,
    isAuthLoading,
  });

  const socketConnected = useScannerPairingStore((s) => s.socketConnected);
  const stationPhase = useScannerPairingStore((s) => s.stationPhase);
  const stationBarcode = useScannerPairingStore((s) => s.stationBarcode);

  const isSessionConnected = phase === 'ready' && session?.status === 'CONNECTED';

  const isReady = isSessionConnected && socketConnected && !isReconnecting;
  const stationBusy = stationPhase !== 'idle';
  const canScan = isSessionConnected && !stationBusy;

  // Copy follows the station the phone is paired to. Until the session loads we
  // fall back to the QR's purpose, so "Menghubungkan…" reads the right station
  // instead of flashing the recordings default. A ref keeps the scan handler
  // stable so the camera isn't restarted when it resolves.
  const meta = stationPurposeMeta(session?.purpose ?? purpose);
  const metaRef = useRef(meta);
  metaRef.current = meta;

  const handleScanSuccess = useCallback((barcode: string) => {
    toast.success('Barcode terkirim', {
      description: metaRef.current.mobileScanSuccess(barcode),
    });
  }, []);

  useMobileHeartbeat(pairingId, isSessionConnected);

  const {
    videoRef,
    containerRef,
    cameraError,
    barcodeDetected,
    detectionBounds,
    previewBarcode,
    scanHistory,
    retryCamera,
  } = useMobileBarcodeScanner({
    pairingId,
    enabled: canScan,
    onScanSuccess: handleScanSuccess,
  });

  const secureOrigin = cameraError ? getSuggestedSecureOrigin() : null;

  if (!pairingId) {
    return (
      <CenteredMessage
        icon={<ScanLine className="text-muted-foreground size-10" />}
        title="Link tidak valid"
        description="Scan QR yang muncul di desktop buat masangin ponsel ini."
      />
    );
  }

  if (isClaiming || (isAuthLoading && pairingCode)) {
    return (
      <CenteredMessage
        icon={<Loader2 className="text-primary size-10 animate-spin" />}
        title="Lagi masuk"
        description="Pakai akun desktop kamu…"
      />
    );
  }

  if (!isAuthenticated && phase === 'auth') {
    return (
      <CenteredMessage
        icon={<ScanLine className="text-primary size-10" />}
        title="Perlu masuk"
        description={
          claimError ??
          (pairingCode
            ? 'Scan QR baru dari desktop, atau masuk manual.'
            : 'Link ini nggak ada kodenya. Masuk atau scan QR baru dari desktop.')
        }
        action={
          <div className="flex w-full max-w-xs flex-col gap-2">
            {pairingCode ? (
              <Button type="button" className="w-full" onClick={retryClaim}>
                Coba lagi
              </Button>
            ) : null}
            <Button asChild variant="outline" className="w-full">
              <Link href={loginHref as Route}>Masuk</Link>
            </Button>
          </div>
        }
      />
    );
  }

  if (phase === 'loading' || isAuthLoading) {
    return (
      <CenteredMessage
        icon={<Loader2 className="text-primary size-10 animate-spin" />}
        title="Menyambungkan"
        description={meta.connectingLabel}
      />
    );
  }

  if (phase === 'expired') {
    return (
      <CenteredMessage
        icon={<ScanLine className="text-muted-foreground size-10" />}
        title="Sesi kedaluwarsa"
        description={errorMessage ?? 'Minta kode QR baru di desktop.'}
      />
    );
  }

  if (phase === 'error') {
    return (
      <CenteredMessage
        icon={<WifiOff className="text-destructive size-10" />}
        title="Tidak terhubung"
        description={errorMessage ?? meta.unreachableLabel}
        action={
          <Button className="w-full max-w-xs" type="button" onClick={retry}>
            Coba lagi
          </Button>
        }
      />
    );
  }

  const statusLabel = stationBusy
    ? stationPhase === 'countdown'
      ? 'Memulai…'
      : stationPhase === 'recording'
        ? 'Merekam'
        : 'Mengupload'
    : isReady
      ? 'Siap'
      : isReconnecting
        ? 'Menyambung kembali…'
        : isSessionConnected
          ? 'Menyambungkan…'
          : 'Offline';

  const statusClass = stationBusy
    ? 'bg-amber-500/90'
    : isReady
      ? 'bg-emerald-500/90'
      : 'bg-white/20';

  return (
    <main className="bg-background flex min-h-dvh flex-col">
      <div ref={containerRef} className="relative min-h-0 flex-1 bg-black">
        <video ref={videoRef} className="size-full object-cover" muted playsInline autoPlay />

        {!stationBusy ? (
          <BarcodeDetectionOverlay bounds={detectionBounds} detected={barcodeDetected} />
        ) : null}

        {/* Square aim frame with a sweeping scan line — works for a QR or a 1D
            barcode (POS product labels or recording resi). */}
        {canScan && !stationBusy ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative aspect-square w-[68vw] max-w-[17rem] overflow-hidden">
              <span className="absolute top-0 left-0 size-8 rounded-tl-2xl border-t-2 border-l-2 border-white/85" />
              <span className="absolute top-0 right-0 size-8 rounded-tr-2xl border-t-2 border-r-2 border-white/85" />
              <span className="absolute bottom-0 left-0 size-8 rounded-bl-2xl border-b-2 border-l-2 border-white/85" />
              <span className="absolute right-0 bottom-0 size-8 rounded-br-2xl border-r-2 border-b-2 border-white/85" />
              <span className="scan-line bg-primary/80 shadow-primary/50 absolute inset-x-0 h-0.5 shadow-[0_0_10px_2px]" />
            </div>
          </div>
        ) : null}

        {stationBusy ? (
          <MobileStationBusyOverlay
            phase={stationPhase}
            barcode={stationBarcode ?? previewBarcode}
          />
        ) : null}

        <div className="absolute inset-x-0 top-0 flex justify-between gap-2 bg-gradient-to-b from-black/75 to-transparent px-4 py-3 text-white">
          <div className="min-w-0">
            <p className="text-sm font-medium">{meta.mobileTitle}</p>
            {previewBarcode && !stationBusy ? (
              <p className="truncate font-mono text-xs text-white/80">{previewBarcode}</p>
            ) : (
              <p className="truncate text-xs text-white/70">{meta.scanHint}</p>
            )}
          </div>
          <span
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white ${statusClass}`}
          >
            <span className="size-1.5 rounded-full bg-white/90" />
            {statusLabel}
          </span>
        </div>
      </div>

      {cameraError ? (
        <div className="space-y-2 border-t p-4 text-center">
          <p className="text-destructive text-xs">{cameraError}</p>
          {secureOrigin ? (
            <Button asChild size="sm" className="w-full">
              <a href={secureOrigin}>Buka link HTTPS</a>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={retryCamera}
          >
            Coba lagi kamera
          </Button>
        </div>
      ) : null}

      <MobileScanHistory entries={scanHistory} />
    </main>
  );
}
