'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  DownloadCloud,
  Link2,
  Link2Off,
  RefreshCw,
  ShoppingCart,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';

import { usePullOrdersMutation } from '@/modules/orders/hooks/use-orders';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/empty-state';
import { StatCard } from '@/components/stat-card';

import { useMarketplaceConnectionQuery } from '../hooks/use-marketplace-connections';
import {
  useImportListingsMutation,
  useMapListingMutation,
  useMarketplaceListingsQuery,
  useRerunAutoMapMutation,
  useSetSyncEnabledMutation,
  useSyncNowMutation,
  useUnmapListingMutation,
} from '../hooks/use-marketplace-listings';
import type { MarketplaceListingMapping } from '../types';
import { MapListingDialog } from './map-listing-dialog';
import { MarketplaceProviderBadge } from './marketplace-provider-badge';

function SyncStatusBadge({ mapping }: { mapping: MarketplaceListingMapping }) {
  if (!mapping.syncEnabled) return null;
  if (mapping.lastSyncStatus === 'SYNCED') {
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Synced</Badge>;
  }
  if (mapping.lastSyncStatus === 'FAILED') {
    return (
      <Badge variant="destructive" title={mapping.lastSyncError ?? undefined}>
        Sync failed
      </Badge>
    );
  }
  return <Badge variant="outline">Sync pending</Badge>;
}

export function MarketplaceConnectionDetail({ connectionId }: { connectionId: string }) {
  const [mapTarget, setMapTarget] = useState<string | null>(null);

  const connectionQuery = useMarketplaceConnectionQuery(connectionId);
  const listingsQuery = useMarketplaceListingsQuery(connectionId);
  const importMutation = useImportListingsMutation(connectionId);
  const rerunMutation = useRerunAutoMapMutation(connectionId);
  const pullMutation = usePullOrdersMutation(connectionId);
  const mapMutation = useMapListingMutation(connectionId);
  const unmapMutation = useUnmapListingMutation(connectionId);
  const syncToggleMutation = useSetSyncEnabledMutation(connectionId);
  const syncNowMutation = useSyncNowMutation(connectionId);

  async function handleImport() {
    try {
      const result = await importMutation.mutateAsync();
      toast.success('Import complete', {
        description: `${result.imported} listings imported, ${result.autoMapped} auto-mapped.`,
      });
    } catch (error) {
      toast.error('Import failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async function handleRerunAutoMap() {
    try {
      const result = await rerunMutation.mutateAsync();
      toast.success('Auto-map complete', {
        description:
          result.autoMapped > 0
            ? `${result.autoMapped} listing(s) newly mapped.`
            : 'No new SKU matches found.',
      });
    } catch (error) {
      toast.error('Auto-map failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async function handlePullOrders() {
    try {
      const result = await pullMutation.mutateAsync();
      toast.success('Orders pulled', {
        description: `${result.pulled} order(s) pulled, ${result.applied} applied to stock.`,
      });
    } catch (error) {
      toast.error('Pull orders failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async function handleMap(marketplaceProductId: string, variantId: string) {
    try {
      await mapMutation.mutateAsync({ marketplaceProductId, variantId });
      toast.success('Listing mapped');
      setMapTarget(null);
    } catch (error) {
      toast.error('Mapping failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async function handleUnmap(marketplaceProductId: string) {
    try {
      await unmapMutation.mutateAsync(marketplaceProductId);
      toast.success('Listing unmapped');
    } catch (error) {
      toast.error('Unmap failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async function handleToggleSync(marketplaceProductId: string, syncEnabled: boolean) {
    try {
      await syncToggleMutation.mutateAsync({ marketplaceProductId, syncEnabled });
      toast.success(syncEnabled ? 'Sync enabled' : 'Sync disabled');
    } catch (error) {
      toast.error('Could not update sync', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async function handleSyncNow(marketplaceProductId: string) {
    try {
      await syncNowMutation.mutateAsync(marketplaceProductId);
      toast.success('Sync queued', { description: 'The worker will push stock shortly.' });
    } catch (error) {
      toast.error('Sync failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  const connection = connectionQuery.data;
  const listings = listingsQuery.data ?? [];
  const mappedCount = listings.filter((listing) => listing.mapping).length;
  const syncOnCount = listings.filter((listing) => listing.mapping?.syncEnabled).length;
  const reviewCount = listings.filter(
    (listing) => listing.mapping?.mappingStatus === 'NEEDS_REVIEW',
  ).length;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard/marketplace">
          <ArrowLeft className="size-4" />
          Back to channels
        </Link>
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          {connection ? (
            <>
              <div className="flex items-center gap-3">
                <MarketplaceProviderBadge provider={connection.provider} />
                <h2 className="text-xl font-semibold tracking-tight">{connection.shopName}</h2>
              </div>
              <p className="text-muted-foreground text-sm">Shop ID: {connection.shopId}</p>
            </>
          ) : (
            <Skeleton className="h-8 w-48" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void handleRerunAutoMap()}
            disabled={rerunMutation.isPending || listings.length === 0}
          >
            <Wand2 className="size-4" />
            {rerunMutation.isPending ? 'Mapping...' : 'Re-run auto-map'}
          </Button>
          <Button onClick={() => void handleImport()} disabled={importMutation.isPending}>
            <DownloadCloud className="size-4" />
            {importMutation.isPending ? 'Importing...' : 'Import listings'}
          </Button>
          <Button
            variant="outline"
            onClick={() => void handlePullOrders()}
            disabled={pullMutation.isPending}
          >
            <ShoppingCart className="size-4" />
            {pullMutation.isPending ? 'Pulling...' : 'Pull orders'}
          </Button>
        </div>
      </div>

      {listings.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Listings" value={listings.length} icon={ShoppingCart} tone="sky" />
          <StatCard
            label="Matched"
            value={mappedCount}
            icon={Link2}
            tone="emerald"
            hint={`${listings.length - mappedCount} not matched`}
          />
          <StatCard label="Sync on" value={syncOnCount} icon={RefreshCw} tone="primary" />
          <StatCard
            label="Needs review"
            value={reviewCount}
            icon={Wand2}
            tone="amber"
            accentClassName={reviewCount > 0 ? 'text-amber-600' : undefined}
          />
        </div>
      ) : null}

      {listingsQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <EmptyState
          icon={DownloadCloud}
          title="No listings imported yet"
          description="Import this store's listings, then match each one to a product."
          action={
            <Button onClick={() => void handleImport()} disabled={importMutation.isPending}>
              <DownloadCloud className="size-4" />
              Import listings
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Listing</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead>Mapped to</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listings.map((listing) => {
                const mapping = listing.mapping;
                const suggested = listing.suggestedVariant;

                return (
                  <TableRow key={listing.marketplaceProductId}>
                    <TableCell>
                      <div className="font-medium">{listing.externalProductName}</div>
                      <div className="text-muted-foreground text-xs">
                        {listing.externalVariantName ?? '—'}
                        {listing.externalSku ? ` · ${listing.externalSku}` : ''}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{listing.stock}</TableCell>
                    <TableCell>
                      {mapping ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{mapping.variantSku}</Badge>
                            {mapping.autoMapped ? (
                              <span className="text-muted-foreground text-xs">auto</span>
                            ) : null}
                            {mapping.mappingStatus === 'NEEDS_REVIEW' ? (
                              <Badge variant="outline" className="border-amber-500 text-amber-600">
                                Review
                              </Badge>
                            ) : null}
                          </div>
                          <SyncStatusBadge mapping={mapping} />
                        </div>
                      ) : (
                        <Badge variant="outline">Unmapped</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {mapping ? (
                        <div className="flex items-center justify-end gap-3">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center gap-2">
                                <Switch
                                  checked={mapping.syncEnabled}
                                  disabled={
                                    syncToggleMutation.isPending ||
                                    mapping.mappingStatus === 'NEEDS_REVIEW'
                                  }
                                  onCheckedChange={(checked) =>
                                    void handleToggleSync(listing.marketplaceProductId, checked)
                                  }
                                  aria-label="Sync stock to this listing"
                                />
                                <span className="text-muted-foreground text-xs">Sync</span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {mapping.mappingStatus === 'NEEDS_REVIEW'
                                ? 'Confirm the match before turning sync on.'
                                : mapping.syncEnabled
                                  ? 'Stock is pushed to this listing.'
                                  : 'Turn on to push stock to this listing.'}
                            </TooltipContent>
                          </Tooltip>
                          {mapping.syncEnabled ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={syncNowMutation.isPending}
                                  onClick={() => void handleSyncNow(listing.marketplaceProductId)}
                                >
                                  <RefreshCw className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Push stock now</TooltipContent>
                            </Tooltip>
                          ) : null}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={unmapMutation.isPending}
                                onClick={() => void handleUnmap(listing.marketplaceProductId)}
                              >
                                <Link2Off className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Unmap this listing</TooltipContent>
                          </Tooltip>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          {suggested ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={mapMutation.isPending}
                              onClick={() =>
                                void handleMap(listing.marketplaceProductId, suggested.id)
                              }
                            >
                              <Link2 className="size-4" />
                              Map to {suggested.sku}
                              {suggested.quality === 'NORMALIZED' ? ' (similar)' : ''}
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setMapTarget(listing.marketplaceProductId)}
                          >
                            Choose…
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {mapTarget ? (
        <MapListingDialog
          open={Boolean(mapTarget)}
          onOpenChange={(open) => {
            if (!open) setMapTarget(null);
          }}
          isMapping={mapMutation.isPending}
          onSelect={(variantId) => void handleMap(mapTarget, variantId)}
        />
      ) : null}
    </div>
  );
}
