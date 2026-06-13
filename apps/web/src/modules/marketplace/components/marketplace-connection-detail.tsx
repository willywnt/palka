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
import { ErrorState } from '@/components/error-state';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { VariantPickerDialog } from '@/components/variant-picker-dialog';
import { formatDateTime } from '@/lib/formatters';
import { useHasPermission } from '@/modules/users/hooks/use-org';

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
import type { MarketplaceListingItem, MarketplaceListingMapping } from '../types';
import { MarketplaceProviderBadge } from './marketplace-provider-badge';

function SyncStatusBadge({ mapping }: { mapping: MarketplaceListingMapping }) {
  if (!mapping.syncEnabled) return null;
  if (mapping.lastSyncStatus === 'SYNCED') {
    return <StatusBadge tone="ok">Sudah sinkron</StatusBadge>;
  }
  if (mapping.lastSyncStatus === 'FAILED') {
    const badge = <StatusBadge tone="danger">Sinkronisasi gagal</StatusBadge>;
    if (!mapping.lastSyncError) return badge;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className="focus-visible:ring-ring/50 inline-flex cursor-default rounded-md focus-visible:ring-[3px] focus-visible:outline-none"
          >
            {badge}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{mapping.lastSyncError}</TooltipContent>
      </Tooltip>
    );
  }
  return <Badge variant="outline">Menunggu sinkronisasi</Badge>;
}

export function MarketplaceConnectionDetail({ connectionId }: { connectionId: string }) {
  const [mapTarget, setMapTarget] = useState<string | null>(null);
  const { allowed: canManage } = useHasPermission('marketplace.manage');

  const connectionQuery = useMarketplaceConnectionQuery(connectionId);
  const listingsQuery = useMarketplaceListingsQuery(connectionId);
  const importMutation = useImportListingsMutation(connectionId);
  const rerunMutation = useRerunAutoMapMutation(connectionId);
  const mapMutation = useMapListingMutation(connectionId);
  const unmapMutation = useUnmapListingMutation(connectionId);
  const syncToggleMutation = useSetSyncEnabledMutation(connectionId);
  const syncNowMutation = useSyncNowMutation(connectionId);

  async function handleImport() {
    try {
      const result = await importMutation.mutateAsync();
      toast.success('Impor selesai', {
        description: `${result.imported} listing masuk, ${result.autoMapped} otomatis terkait.`,
      });
    } catch (error) {
      toast.error('Gagal impor', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  async function handleRerunAutoMap() {
    try {
      const result = await rerunMutation.mutateAsync();
      toast.success('Auto-kait selesai', {
        description:
          result.autoMapped > 0
            ? `${result.autoMapped} listing baru berhasil dikaitkan.`
            : 'Belum ada SKU baru yang bisa dikaitkan.',
      });
    } catch (error) {
      toast.error('Auto-kait gagal', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  async function handleMap(marketplaceProductId: string, variantId: string) {
    try {
      await mapMutation.mutateAsync({ marketplaceProductId, variantId });
      toast.success('Listing berhasil dikaitkan');
      setMapTarget(null);
    } catch (error) {
      toast.error('Gagal mengaitkan', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  async function handleUnmap(marketplaceProductId: string) {
    try {
      await unmapMutation.mutateAsync(marketplaceProductId);
      toast.success('Listing dilepas');
    } catch (error) {
      toast.error('Gagal melepas listing', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  async function handleToggleSync(marketplaceProductId: string, syncEnabled: boolean) {
    try {
      await syncToggleMutation.mutateAsync({ marketplaceProductId, syncEnabled });
      toast.success(syncEnabled ? 'Sinkronisasi diaktifkan' : 'Sinkronisasi dimatikan');
    } catch (error) {
      toast.error('Gagal mengubah sinkronisasi', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  async function handleSyncNow(marketplaceProductId: string) {
    try {
      await syncNowMutation.mutateAsync(marketplaceProductId);
      toast.success('Sinkronisasi diantrekan', {
        description: 'Stok akan dikirim sebentar lagi.',
      });
    } catch (error) {
      toast.error('Gagal sinkronisasi', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
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

  // Mapping summary (SKU badge + status + last-sync stamp) — shared by table & cards.
  function renderMappingInfo(mapping: MarketplaceListingMapping | null) {
    if (!mapping) return <Badge variant="outline">Belum dikaitkan</Badge>;

    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{mapping.variantSku}</Badge>
          {mapping.autoMapped ? (
            <span className="text-muted-foreground text-xs">otomatis</span>
          ) : null}
          {mapping.mappingStatus === 'NEEDS_REVIEW' ? (
            <StatusBadge tone="warn">Tinjau</StatusBadge>
          ) : null}
        </div>
        {mapping.syncEnabled || mapping.lastSyncedAt ? (
          <div className="flex flex-wrap items-center gap-2">
            <SyncStatusBadge mapping={mapping} />
            {mapping.lastSyncedAt ? (
              <span className="text-muted-foreground text-xs">
                Sinkron <span suppressHydrationWarning>{formatDateTime(mapping.lastSyncedAt)}</span>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  // Row actions (sync switch + icon buttons, or the map buttons) — shared by table & cards.
  // Mapping/sync controls need marketplace.manage, so without it no actions show (cosmetic; server guards).
  function renderListingActions(listing: MarketplaceListingItem) {
    if (!canManage) return null;
    const mapping = listing.mapping;
    const suggested = listing.suggestedVariant;

    if (mapping) {
      return (
        <div className="flex items-center justify-end gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-2">
                <Switch
                  checked={mapping.syncEnabled}
                  disabled={
                    syncToggleMutation.isPending || mapping.mappingStatus === 'NEEDS_REVIEW'
                  }
                  onCheckedChange={(checked) =>
                    void handleToggleSync(listing.marketplaceProductId, checked)
                  }
                  aria-label="Sinkronisasi stok ke listing ini"
                />
                <span className="text-muted-foreground text-xs">Sinkronisasi</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {mapping.mappingStatus === 'NEEDS_REVIEW'
                ? 'Konfirmasi kaitannya dulu sebelum sinkronisasi diaktifkan.'
                : mapping.syncEnabled
                  ? 'Stok dikirim ke listing ini.'
                  : 'Aktifkan untuk kirim stok ke listing ini.'}
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
                  <span className="sr-only">Kirim stok sekarang</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Kirim stok sekarang</TooltipContent>
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
                <span className="sr-only">Lepas listing ini</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Lepas listing ini</TooltipContent>
          </Tooltip>
        </div>
      );
    }

    return (
      <div className="flex flex-wrap justify-end gap-2">
        {suggested ? (
          <Button
            variant="outline"
            size="sm"
            className="h-9 sm:h-8"
            disabled={mapMutation.isPending}
            onClick={() => void handleMap(listing.marketplaceProductId, suggested.id)}
          >
            <Link2 className="size-4" />
            Kaitkan ke {suggested.sku}
            {suggested.quality === 'NORMALIZED' ? ' (mirip)' : ''}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 sm:h-8"
          onClick={() => setMapTarget(listing.marketplaceProductId)}
        >
          Pilih…
        </Button>
      </div>
    );
  }

  const backLink = (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link href="/dashboard/marketplace">
        <ArrowLeft className="size-4" />
        Kembali ke channel
      </Link>
    </Button>
  );

  if (connectionQuery.error) {
    return (
      <div className="space-y-6">
        {backLink}
        <ErrorState
          title="Gagal memuat detail channel"
          onRetry={() => void connectionQuery.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {backLink}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          {connection ? (
            <>
              <p className="eyebrow text-primary">Channel penjualan</p>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-balance">
                  {connection.shopName}
                </h1>
                <MarketplaceProviderBadge provider={connection.provider} />
              </div>
              <p className="text-muted-foreground text-sm">
                ID toko: <span className="num">{connection.shopId}</span>
              </p>
            </>
          ) : (
            <Skeleton className="h-8 w-48" />
          )}
        </div>
        {/* Both header actions need marketplace.manage — drop the whole strip, not an empty box. */}
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void handleRerunAutoMap()}
              disabled={rerunMutation.isPending || listings.length === 0}
            >
              <Wand2 className="size-4" />
              {rerunMutation.isPending ? 'Mengaitkan...' : 'Auto-kait lagi'}
            </Button>
            <Button onClick={() => void handleImport()} disabled={importMutation.isPending}>
              <DownloadCloud className="size-4" />
              {importMutation.isPending ? 'Mengimpor...' : 'Impor listing'}
            </Button>
          </div>
        ) : null}
      </div>

      {listings.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Listing" value={listings.length} icon={ShoppingCart} tone="sky" />
          <StatCard
            label="Sudah dikaitkan"
            value={mappedCount}
            icon={Link2}
            tone="emerald"
            hint={`${listings.length - mappedCount} belum dikaitkan`}
          />
          <StatCard
            label="Sinkronisasi aktif"
            value={syncOnCount}
            icon={RefreshCw}
            tone="primary"
          />
          <StatCard
            label="Perlu ditinjau"
            value={reviewCount}
            icon={Wand2}
            tone="amber"
            accentClassName={reviewCount > 0 ? 'text-status-warn' : undefined}
          />
        </div>
      ) : null}

      {listingsQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : listingsQuery.error ? (
        <ErrorState title="Gagal memuat listing" onRetry={() => void listingsQuery.refetch()} />
      ) : listings.length === 0 ? (
        <EmptyState
          icon={DownloadCloud}
          title="Belum ada listing diimpor"
          description="Impor listing toko ini, lalu kaitkan satu per satu ke produk."
          action={
            canManage ? (
              <Button onClick={() => void handleImport()} disabled={importMutation.isPending}>
                <DownloadCloud className="size-4" />
                Impor listing
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="hidden rounded-xl border sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Listing</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                  <TableHead>Dikaitkan ke</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listings.map((listing) => (
                  <TableRow key={listing.marketplaceProductId}>
                    <TableCell>
                      <div className="font-medium">{listing.externalProductName}</div>
                      <div className="text-muted-foreground text-xs">
                        {listing.externalVariantName ?? '—'}
                        {listing.externalSku ? ` · ${listing.externalSku}` : ''}
                      </div>
                    </TableCell>
                    <TableCell className="num text-right">{listing.stock}</TableCell>
                    <TableCell>{renderMappingInfo(listing.mapping)}</TableCell>
                    <TableCell className="text-right">{renderListingActions(listing)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 sm:hidden">
            {listings.map((listing) => (
              <div key={listing.marketplaceProductId} className="bg-card rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{listing.externalProductName}</p>
                    <p className="text-muted-foreground text-xs">
                      {listing.externalVariantName ?? '—'}
                      {listing.externalSku ? ` · ${listing.externalSku}` : ''}
                    </p>
                  </div>
                  <p className="text-muted-foreground shrink-0 text-sm">
                    Stok <span className="num text-foreground font-medium">{listing.stock}</span>
                  </p>
                </div>
                <div className="mt-3">{renderMappingInfo(listing.mapping)}</div>
                <div className="mt-3">{renderListingActions(listing)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {mapTarget ? (
        <VariantPickerDialog
          open={Boolean(mapTarget)}
          onOpenChange={(open) => {
            if (!open) setMapTarget(null);
          }}
          title="Kaitkan ke varian"
          description="Pilih varian di tokomu yang sama dengan listing ini."
          busy={mapMutation.isPending}
          onSelect={(variantId) => void handleMap(mapTarget, variantId)}
        />
      ) : null}
    </div>
  );
}
