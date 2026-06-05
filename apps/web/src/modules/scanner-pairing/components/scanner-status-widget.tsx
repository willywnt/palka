'use client';

import { ScanLine } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useActivePairingQuery, useDisconnectPairingMutation } from '../hooks/use-pairing-api';
import { useDesktopScannerSocket } from '../hooks/use-desktop-scanner-socket';
import { useScannerPairingStore } from '../store/scanner-pairing.store';

type ScannerStatusWidgetProps = {
  onConnectClick: () => void;
};

/**
 * Compact phone-scanner status for the recording station — same visual language
 * as the POS till (colour-coded dot + concise status + small action). Only
 * reflects a RECORDING pairing so a POS phone never lights this up.
 */
export function ScannerStatusWidget({ onConnectClick }: ScannerStatusWidgetProps) {
  const { data: active, refetch } = useActivePairingQuery();
  const connectionState = useScannerPairingStore((s) => s.connectionState);

  const session = active?.session?.purpose === 'RECORDING' ? active.session : null;
  const disconnectMutation = useDisconnectPairingMutation();

  useDesktopScannerSocket(session?.id ?? null);

  const isConnected =
    Boolean(session) && (session?.status === 'CONNECTED' || connectionState === 'connected');
  const isWaiting = !isConnected && session?.status === 'PENDING';

  const dot = isConnected
    ? 'bg-emerald-500'
    : isWaiting
      ? 'bg-amber-500'
      : 'bg-muted-foreground/40';
  const label = isConnected
    ? 'Phone connected — scan resi barcodes'
    : isWaiting
      ? 'Waiting for phone to connect…'
      : 'Phone scanner not connected';

  const handleDisconnect = async () => {
    if (!session?.id) return;
    await disconnectMutation.mutateAsync(session.id);
    void refetch();
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <span className="flex min-w-0 items-center gap-2">
        <span className={cn('size-2 shrink-0 rounded-full', dot)} aria-hidden />
        <ScanLine className="text-muted-foreground size-4 shrink-0" />
        <span className="text-muted-foreground truncate text-xs">{label}</span>
      </span>

      <span className="flex shrink-0 items-center gap-1">
        {isConnected && session?.id ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disconnectMutation.isPending}
            onClick={() => void handleDisconnect()}
          >
            Disconnect
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" onClick={onConnectClick}>
          {isConnected || isWaiting ? 'Show QR' : 'Connect'}
        </Button>
      </span>
    </div>
  );
}
