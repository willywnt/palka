'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

import { SyncStatusBadge } from './sync-status-badge';
import { useMarketplaceSyncJobDetailQuery } from '../hooks/use-marketplace-sync';

export function SyncJobDetailModal({
  syncJobId,
  open,
  onOpenChange,
}: {
  syncJobId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const query = useMarketplaceSyncJobDetailQuery(open ? syncJobId : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sync job detail</DialogTitle>
          <DialogDescription>
            Inspect failure reason, payload, and provider response.
          </DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : query.data ? (
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <SyncStatusBadge status={query.data.syncStatus} />
            </div>
            <DetailRow label="Internal SKU" value={query.data.internalSku} mono />
            <DetailRow label="Marketplace SKU" value={query.data.externalSku ?? '—'} mono />
            <DetailRow label="Store" value={query.data.storeName} />
            <DetailRow label="Attempts" value={String(query.data.attempts)} />
            {query.data.errorMessage ? (
              <div className="bg-destructive/10 rounded-lg border p-3">
                <p className="text-destructive text-xs font-medium uppercase">Failure</p>
                <p className="mt-1">{query.data.errorMessage}</p>
              </div>
            ) : null}
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Payload</p>
              <pre className="bg-muted max-h-40 overflow-auto rounded-lg p-3 text-xs">
                {query.data.payload
                  ? JSON.stringify(query.data.payload, null, 2)
                  : 'No payload stored'}
              </pre>
            </div>
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                Provider response
              </p>
              <pre className="bg-muted max-h-40 overflow-auto rounded-lg p-3 text-xs">
                {query.data.providerResponse
                  ? JSON.stringify(query.data.providerResponse, null, 2)
                  : 'No provider response yet'}
              </pre>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Unable to load sync job.</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'text-right font-mono text-xs' : 'text-right'}>{value}</span>
    </div>
  );
}
