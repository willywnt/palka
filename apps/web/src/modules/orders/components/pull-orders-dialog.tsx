'use client';

import { useEffect, useState } from 'react';
import { DownloadCloud } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useMarketplaceConnectionsQuery } from '@/modules/marketplace/hooks/use-marketplace-connections';

import { usePullFromConnectionsMutation } from '../hooks/use-orders';

export function PullOrdersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: connections } = useMarketplaceConnectionsQuery();
  const activeStores = (connections ?? []).filter((connection) => connection.isActive);
  const pullMutation = usePullFromConnectionsMutation();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Default to every active store each time the dialog opens.
  useEffect(() => {
    if (open) {
      setSelected(new Set((connections ?? []).filter((c) => c.isActive).map((c) => c.id)));
    }
  }, [open, connections]);

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handlePull() {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      toast.info('Select at least one store.');
      return;
    }

    try {
      const result = await pullMutation.mutateAsync(
        ids.length === activeStores.length ? undefined : ids,
      );
      const parts = [`${result.pulled} order(s) from ${result.storesPulled} store(s)`];
      if (result.applied > 0) parts.push(`${result.applied} applied to stock`);
      toast.success('Orders pulled', { description: parts.join(' · ') });
      if (result.storesSkipped.length > 0) {
        toast.info(`Skipped (pulled recently): ${result.storesSkipped.join(', ')}`);
      }
      onOpenChange(false);
    } catch (error) {
      toast.error('Pull failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pull orders</DialogTitle>
          <DialogDescription>Choose which connected stores to pull orders from.</DialogDescription>
        </DialogHeader>

        {activeStores.length === 0 ? (
          <p className="text-muted-foreground text-sm">No active stores are connected.</p>
        ) : (
          <div className="space-y-2">
            {activeStores.map((store) => (
              <div
                key={store.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2"
              >
                <span className="text-sm font-medium">{store.shopName}</span>
                <Switch
                  checked={selected.has(store.id)}
                  onCheckedChange={(on) => toggle(store.id, on)}
                  aria-label={`Pull from ${store.shopName}`}
                />
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handlePull()}
            disabled={pullMutation.isPending || activeStores.length === 0}
          >
            <DownloadCloud className="size-4" />
            {pullMutation.isPending ? 'Pulling...' : 'Pull orders'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
