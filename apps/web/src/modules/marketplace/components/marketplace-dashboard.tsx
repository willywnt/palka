'use client';

import { useState } from 'react';
import { Plus, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/empty-state';

import type { MarketplaceConnectionListItem } from '../types';
import {
  useDisconnectMarketplaceMutation,
  useMarketplaceConnectionsQuery,
} from '../hooks/use-marketplace-connections';
import { AddMarketplaceModal } from './add-marketplace-modal';
import { DisconnectMarketplaceDialog } from './disconnect-marketplace-dialog';
import { MarketplaceTable } from './marketplace-table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function MarketplaceDashboard() {
  const [addOpen, setAddOpen] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<MarketplaceConnectionListItem | null>(
    null,
  );

  const { data, isLoading, error } = useMarketplaceConnectionsQuery();
  const disconnectMutation = useDisconnectMarketplaceMutation();

  async function handleDisconnectConfirm() {
    if (!disconnectTarget) return;

    try {
      await disconnectMutation.mutateAsync(disconnectTarget.id);
      toast.success('Marketplace disconnected', {
        description: `${disconnectTarget.shopName} has been deactivated.`,
      });
      setDisconnectTarget(null);
    } catch (disconnectError) {
      toast.error('Disconnect failed', {
        description: disconnectError instanceof Error ? disconnectError.message : 'Unknown error',
      });
    }
  }

  const activeCount = data?.filter((item) => item.isActive).length ?? 0;
  const isEmpty = !isLoading && (data?.length ?? 0) === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-muted-foreground text-sm">
            {isLoading
              ? 'Loading connected stores...'
              : `${activeCount} active store${activeCount === 1 ? '' : 's'} · ${data?.length ?? 0} total`}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Connect store
        </Button>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          Failed to load marketplace connections.{' '}
          {error instanceof Error ? error.message : 'Please try again.'}
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={ShoppingBag}
          title="No marketplace stores connected"
          description="Connect Shopee or Tokopedia stores to prepare for inventory and order synchronization."
        />
      ) : (
        <MarketplaceTable
          connections={data ?? []}
          onDisconnect={setDisconnectTarget}
          isDisconnecting={disconnectMutation.isPending}
        />
      )}

      <AddMarketplaceModal open={addOpen} onOpenChange={setAddOpen} />

      <DisconnectMarketplaceDialog
        connection={disconnectTarget}
        open={Boolean(disconnectTarget)}
        onOpenChange={(open) => {
          if (!open) setDisconnectTarget(null);
        }}
        onConfirm={() => void handleDisconnectConfirm()}
        isDisconnecting={disconnectMutation.isPending}
      />
    </div>
  );
}
