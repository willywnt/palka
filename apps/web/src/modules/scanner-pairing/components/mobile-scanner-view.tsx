'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useCallback, useRef } from 'react';
import { Loader2, ScanLine, WifiOff } from 'lucide-react';
import { toast } from 'sonner';

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

export function MobileScannerView({ pairingId, pairingCode, loginHref }: MobileScannerViewProps) {
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

  // Copy follows the station the phone is paired to (recordings vs POS). A ref
  // keeps the scan handler stable so the camera isn't restarted when it resolves.
  const meta = stationPurposeMeta(session?.purpose);
  const metaRef = useRef(meta);
  metaRef.current = meta;

  const handleScanSuccess = useCallback((barcode: string) => {
    toast.success('Barcode sent', {
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
        title="Invalid link"
        description="Scan the QR code shown on the desktop to pair this phone."
      />
    );
  }

  if (isClaiming || (isAuthLoading && pairingCode)) {
    return (
      <CenteredMessage
        icon={<Loader2 className="text-primary size-10 animate-spin" />}
        title="Signing in"
        description="Using your desktop station account…"
      />
    );
  }

  if (!isAuthenticated && phase === 'auth') {
    return (
      <CenteredMessage
        icon={<ScanLine className="text-primary size-10" />}
        title="Sign in required"
        description={
          claimError ??
          (pairingCode
            ? 'Scan a fresh QR code from the desktop, or sign in manually.'
            : 'This link is missing a code. Sign in or scan a new QR from desktop.')
        }
        action={
          <div className="flex w-full max-w-xs flex-col gap-2">
            {pairingCode ? (
              <Button type="button" className="w-full" onClick={retryClaim}>
                Try again
              </Button>
            ) : null}
            <Button asChild variant="outline" className="w-full">
              <Link href={loginHref as Route}>Sign in</Link>
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
        title="Connecting"
        description={meta.connectingLabel}
      />
    );
  }

  if (phase === 'expired') {
    return (
      <CenteredMessage
        icon={<ScanLine className="text-muted-foreground size-10" />}
        title="Session expired"
        description={errorMessage ?? 'Ask for a new QR code on desktop.'}
      />
    );
  }

  if (phase === 'error') {
    return (
      <CenteredMessage
        icon={<WifiOff className="text-destructive size-10" />}
        title="Not connected"
        description={errorMessage ?? meta.unreachableLabel}
        action={
          <Button className="w-full max-w-xs" type="button" onClick={retry}>
            Try again
          </Button>
        }
      />
    );
  }

  const statusLabel = stationBusy
    ? stationPhase === 'countdown'
      ? 'Starting…'
      : stationPhase === 'recording'
        ? 'Recording'
        : 'Uploading'
    : isReady
      ? 'Ready'
      : isReconnecting
        ? 'Reconnecting…'
        : isSessionConnected
          ? 'Linking…'
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
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      {cameraError ? (
        <div className="space-y-2 border-t p-4 text-center">
          <p className="text-destructive text-xs">{cameraError}</p>
          {secureOrigin ? (
            <Button asChild size="sm" className="w-full">
              <a href={secureOrigin}>Open HTTPS link</a>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={retryCamera}
          >
            Retry camera
          </Button>
        </div>
      ) : null}

      <MobileScanHistory entries={scanHistory} />
    </main>
  );
}
