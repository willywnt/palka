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
import { ErrorState } from '@/components/error-state';
import { formatRelativeTime } from '@/lib/formatters';
import { useMarketplaceConnectionsQuery } from '@/modules/marketplace/hooks/use-marketplace-connections';

import { usePullFromConnectionsMutation } from '../hooks/use-orders';

export function PullOrdersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: connections, isLoading, error, refetch } = useMarketplaceConnectionsQuery();
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
      toast.info('Pilih minimal satu toko.');
      return;
    }

    try {
      const result = await pullMutation.mutateAsync(
        ids.length === activeStores.length ? undefined : ids,
      );
      const parts = [`${result.pulled} pesanan dari ${result.storesPulled} toko`];
      if (result.applied > 0) parts.push(`${result.applied} stok dipesan`);
      if (result.shipped > 0) parts.push(`${result.shipped} dikirim`);
      if (result.reverted > 0) parts.push(`${result.reverted} direstok (batal)`);
      toast.success('Pesanan ditarik', { description: parts.join(' · ') });
      if (result.storesSkipped.length > 0) {
        toast.info(`Dilewati (baru aja ditarik): ${result.storesSkipped.join(', ')}`);
      }
      onOpenChange(false);
    } catch (error) {
      toast.error('Gagal menarik pesanan', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tarik pesanan</DialogTitle>
          <DialogDescription>Pilih toko terhubung yang mau ditarik pesanannya.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Memuat toko...</p>
        ) : error ? (
          <ErrorState
            title="Gagal memuat toko"
            description={error instanceof Error ? error.message : undefined}
            onRetry={() => void refetch()}
            className="p-6"
          />
        ) : activeStores.length === 0 ? (
          <p className="text-muted-foreground text-sm">Belum ada toko aktif yang terhubung.</p>
        ) : (
          <div className="space-y-2">
            {activeStores.map((store) => (
              <div
                key={store.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="block truncate text-sm font-medium">{store.shopName}</span>
                  <span className="text-muted-foreground text-xs" suppressHydrationWarning>
                    {store.lastOrdersPulledAt
                      ? `Terakhir ditarik ${formatRelativeTime(store.lastOrdersPulledAt)}`
                      : 'Belum pernah ditarik'}
                  </span>
                </div>
                <Switch
                  checked={selected.has(store.id)}
                  onCheckedChange={(on) => toggle(store.id, on)}
                  aria-label={`Tarik dari ${store.shopName}`}
                />
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            type="button"
            onClick={() => void handlePull()}
            disabled={pullMutation.isPending || activeStores.length === 0}
          >
            <DownloadCloud className="size-4" />
            {pullMutation.isPending ? 'Menarik...' : 'Tarik pesanan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
