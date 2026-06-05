'use client';

import { ScanLine, Volume2, VolumeX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useActivePairingQuery } from '../hooks/use-pairing-api';
import { useDesktopScannerSocket } from '../hooks/use-desktop-scanner-socket';
import { useScannerPairingStore } from '../store/scanner-pairing.store';

type ScannerStatusWidgetProps = {
  onConnectClick: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
};

/**
 * Compact phone-scanner control for the recording station header — same visual
 * language as the POS till (mute toggle + a colour-coded dot + a Connect/Show QR
 * button that opens the pairing dialog). Reflects only a RECORDING pairing so a
 * POS phone never lights it up; disconnect lives in the dialog.
 */
export function ScannerStatusWidget({
  onConnectClick,
  soundOn,
  onToggleSound,
}: ScannerStatusWidgetProps) {
  const { data: active } = useActivePairingQuery();
  const connectionState = useScannerPairingStore((s) => s.connectionState);

  const session = active?.session?.purpose === 'RECORDING' ? active.session : null;
  useDesktopScannerSocket(session?.id ?? null);

  const isConnected =
    Boolean(session) && (session?.status === 'CONNECTED' || connectionState === 'connected');
  const isWaiting = !isConnected && session?.status === 'PENDING';

  const dot = isConnected
    ? 'bg-emerald-500'
    : isWaiting
      ? 'bg-amber-500'
      : 'bg-muted-foreground/40';
  const cta = isConnected ? 'Phone connected' : isWaiting ? 'Show QR' : 'Scan with phone';

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={onToggleSound}
        aria-label={soundOn ? 'Mute scan sound' : 'Unmute scan sound'}
        title={soundOn ? 'Mute scan sound' : 'Unmute scan sound'}
      >
        {soundOn ? (
          <Volume2 className="size-4" />
        ) : (
          <VolumeX className="text-muted-foreground size-4" />
        )}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onConnectClick}>
        <span className={cn('size-2 rounded-full', dot)} aria-hidden />
        <ScanLine className="size-4" />
        {cta}
      </Button>
    </div>
  );
}
