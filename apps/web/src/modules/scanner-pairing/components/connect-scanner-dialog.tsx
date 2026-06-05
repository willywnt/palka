'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import QRCode from 'qrcode';
import { Loader2, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import type { PairingPurpose } from '@prisma/client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import {
  useActivePairingQuery,
  useCreatePairingMutation,
  useDisconnectPairingMutation,
} from '../hooks/use-pairing-api';
import { useScannerPairingStore } from '../store/scanner-pairing.store';
import { stationPurposeMeta } from '../station-purpose';

type ConnectScannerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which station this pairing drives — recordings (default) or POS scan-to-cart. */
  purpose?: PairingPurpose;
};

export function ConnectScannerDialog({
  open,
  onOpenChange,
  purpose = 'RECORDING',
}: ConnectScannerDialogProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const meta = stationPurposeMeta(purpose);
  const pathname = usePathname();

  const { status: authStatus } = useSession();
  const isAuthenticated = authStatus === 'authenticated';

  const connectionState = useScannerPairingStore((s) => s.connectionState);
  const setConnectionState = useScannerPairingStore((s) => s.setConnectionState);

  const { data: activePairing, isFetched: isActivePairingFetched } = useActivePairingQuery(
    open && isAuthenticated,
  );
  const createPairing = useCreatePairingMutation(purpose);
  const createPairingRef = useRef(createPairing.mutateAsync);
  createPairingRef.current = createPairing.mutateAsync;
  const createStartedRef = useRef(false);
  const disconnectPairing = useDisconnectPairingMutation();

  const displaySession = activePairing?.session ?? null;
  const isConnected = connectionState === 'connected' || displaySession?.status === 'CONNECTED';

  // Only reuse the active session when it drives the SAME station; a mismatch
  // (e.g. a recordings session while opening the POS dialog) forces a fresh
  // pairing of the right purpose, which supersedes the other.
  const isReusableSession =
    (displaySession?.status === 'PENDING' ||
      displaySession?.status === 'CONNECTED' ||
      displaySession?.status === 'DISCONNECTED') &&
    displaySession?.purpose === purpose;

  const runCreatePairing = () => {
    createStartedRef.current = true;
    setCreateError(null);

    void createPairingRef
      .current()
      .then((result) => {
        // The create mutation's onSuccess seeds the active-pairing query cache;
        // here we only need the QR + the client-side connection state.
        setConnectionState('pending');
        return QRCode.toDataURL(result.qrPayload, { width: 240, margin: 2 });
      })
      .then(setQrDataUrl)
      .catch((error: Error & { code?: string }) => {
        createStartedRef.current = false;
        const message =
          error.code === 'UNAUTHORIZED'
            ? 'You are not signed in. Log in at https://localhost:3000 (same account), then try again.'
            : error.message;
        setCreateError(message);
        toast.error('Failed to create pairing session', { description: message });
      });
  };

  useEffect(() => {
    if (!open) {
      setQrDataUrl(null);
      setCreateError(null);
      createStartedRef.current = false;
      return;
    }

    if (authStatus === 'loading') {
      return;
    }

    if (!isAuthenticated) {
      return;
    }

    if (!isActivePairingFetched) {
      return;
    }

    const loadQr = async (connectUrl: string) => {
      const dataUrl = await QRCode.toDataURL(connectUrl, { width: 240, margin: 2 });
      setQrDataUrl(dataUrl);
    };

    if (isReusableSession && displaySession) {
      setConnectionState(displaySession.status === 'CONNECTED' ? 'connected' : 'pending');
      if (activePairing?.connectUrl) {
        void loadQr(activePairing.connectUrl);
      }
      return;
    }

    if (createStartedRef.current || createPairing.isPending) {
      return;
    }

    runCreatePairing();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated by auth + createStartedRef
  }, [
    open,
    authStatus,
    isAuthenticated,
    isActivePairingFetched,
    isReusableSession,
    displaySession?.id,
    activePairing?.connectUrl,
  ]);

  useEffect(() => {
    if (displaySession?.status === 'CONNECTED') {
      setConnectionState('connected');
    }
  }, [displaySession?.status, setConnectionState]);

  const handleDisconnect = async () => {
    if (!displaySession?.id) return;
    try {
      await disconnectPairing.mutateAsync(displaySession.id);
      setConnectionState('idle');
      setQrDataUrl(null);
      createStartedRef.current = false;
      onOpenChange(false);
      toast.success('Mobile scanner disconnected');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Disconnect failed');
    }
  };

  const statusLabel = isConnected
    ? 'Phone connected — ready to scan'
    : displaySession?.status === 'PENDING'
      ? 'Scan this QR with your phone camera'
      : displaySession?.status === 'DISCONNECTED'
        ? 'Phone dropped — scan again to reconnect'
        : 'Preparing QR…';

  const isQrLoading =
    authStatus === 'loading' ||
    (isAuthenticated && !qrDataUrl && (createPairing.isPending || !isActivePairingFetched));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex w-[min(100%-2rem,22rem)] max-w-[22rem] flex-col gap-0 overflow-hidden p-0 sm:max-w-[22rem]">
        <div className="space-y-1.5 px-5 pt-5 pr-12">
          <DialogHeader className="gap-1.5 text-left">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
              <Smartphone className="size-4 shrink-0" />
              Phone scanner
              <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                {meta.shortLabel}
              </span>
            </DialogTitle>
            <DialogDescription className="text-left text-xs">
              {meta.description} Use the same account as this PC.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex flex-col items-center px-5 py-4">
          {authStatus === 'loading' ? (
            <div className="flex aspect-square w-full max-w-[240px] items-center justify-center">
              <Loader2 className="text-muted-foreground size-8 animate-spin" />
            </div>
          ) : !isAuthenticated ? (
            <div className="space-y-3 py-6 text-center">
              <p className="text-muted-foreground text-sm">
                Sign in on this PC first (same browser), then reopen this dialog.
              </p>
              <Button asChild size="sm">
                <a href={`/login?callbackUrl=${encodeURIComponent(pathname)}`}>Sign in</a>
              </Button>
            </div>
          ) : (
            <>
              <div className="bg-muted/30 flex aspect-square w-full max-w-[240px] items-center justify-center overflow-hidden rounded-lg border">
                {isQrLoading ? (
                  <Loader2 className="text-muted-foreground size-8 animate-spin" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- dynamic QR data URL
                  <img
                    src={qrDataUrl ?? ''}
                    alt="QR code for mobile scanner"
                    className="size-full object-contain p-2"
                  />
                )}
              </div>
              {createError ? (
                <div className="mt-3 space-y-2 text-center">
                  <p className="text-destructive text-xs">{createError}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      createStartedRef.current = false;
                      runCreatePairing();
                    }}
                  >
                    Try again
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground mt-3 flex items-center justify-center gap-1.5 text-center text-xs">
                  {isConnected ? (
                    <Wifi className="size-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <WifiOff className="size-3.5 shrink-0" />
                  )}
                  <span className="text-foreground font-medium">{statusLabel}</span>
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-row gap-2 border-t px-5 py-4 sm:justify-between">
          {isConnected ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleDisconnect()}
            >
              Disconnect
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
