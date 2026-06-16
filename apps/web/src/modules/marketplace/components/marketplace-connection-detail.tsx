'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  DownloadCloud,
  Link2,
  Link2Off,
  PlugZap,
  RefreshCw,
  Search,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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
import { EllipsisTooltip } from '@/components/ui/action-tooltip';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { StatusBadge } from '@/components/status-badge';
import { TablePagination } from '@/components/table-pagination';
import { VariantPickerDialog } from '@/components/variant-picker-dialog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePagination } from '@/hooks/use-pagination';
import { formatDateTime } from '@/lib/formatters';
import { useHasPermission } from '@/modules/users/hooks/use-org';

import {
  useMarketplaceConnectionQuery,
  useRefreshConnectionMutation,
  useTestConnectionMutation,
} from '../hooks/use-marketplace-connections';
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
import { LISTING_STATUS_FILTERS, type ListingStatusFilter } from '../validators/list-listings';
import { MarketplaceHealthPanel } from './marketplace-health-panel';
import { MarketplaceProviderBadge } from './marketplace-provider-badge';
import { SyncWarehouseCard } from './sync-warehouse-card';

const ALL_STATUS = 'all' as const;

const LISTING_STATUS_LABELS: Record<ListingStatusFilter | typeof ALL_STATUS, string> = {
  all: 'Semua listing',
  unmapped: 'Belum dikaitkan',
  needs_review: 'Perlu ditinjau',
  mapped: 'Sudah dikaitkan',
  sync_failed: 'Gagal sinkron',
};

/** "variant · sku" line under the listing name (or — when neither is set). */
function listingSubtitle(listing: MarketplaceListingItem): string {
  const parts = [listing.externalVariantName, listing.externalSku].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

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

  const { page, setPage, pageSize, setPageSize } = usePagination(20);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [statusFilter, setStatusFilter] = useState<ListingStatusFilter | typeof ALL_STATUS>(
    ALL_STATUS,
  );

  const connectionQuery = useMarketplaceConnectionQuery(connectionId);
  const listingsQuery = useMarketplaceListingsQuery(connectionId, page, pageSize, {
    search,
    status: statusFilter === ALL_STATUS ? undefined : statusFilter,
  });
  const importMutation = useImportListingsMutation(connectionId);
  const rerunMutation = useRerunAutoMapMutation(connectionId);
  const mapMutation = useMapListingMutation(connectionId);
  const unmapMutation = useUnmapListingMutation(connectionId);
  const syncToggleMutation = useSetSyncEnabledMutation(connectionId);
  const syncNowMutation = useSyncNowMutation(connectionId);
  const refreshMutation = useRefreshConnectionMutation(connectionId);
  const testMutation = useTestConnectionMutation(connectionId);

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

  async function handleRefreshToken() {
    try {
      await refreshMutation.mutateAsync();
      toast.success('Token diperbarui', { description: 'Akses ke Lazada diperpanjang.' });
    } catch (error) {
      toast.error('Gagal memperbarui token', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  async function handleTestConnection() {
    try {
      const result = await testMutation.mutateAsync();
      if (result.ready) {
        toast.success('Koneksi sehat', { description: 'Token Lazada valid.' });
      } else {
        toast.error('Koneksi bermasalah', { description: result.reason ?? 'Token tidak valid.' });
      }
    } catch (error) {
      toast.error('Gagal tes koneksi', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  const connection = connectionQuery.data;
  const listings = listingsQuery.data?.items ?? [];
  const listingsMeta = listingsQuery.data?.meta;
  const totalListings = listingsMeta?.total ?? 0;
  const hasFilter = search.trim().length > 0 || statusFilter !== ALL_STATUS;

  // "Dikaitkan ke": the internal variant (product · variant on top, SKU below) — same
  // format as the listing name. Unmapped rows show nothing (no badge), per design.
  function renderLinkedTo(mapping: MarketplaceListingMapping | null) {
    if (!mapping) return <span className="text-muted-foreground">—</span>;

    const label = [mapping.productName, mapping.variantName].filter(Boolean).join(' · ');
    return (
      <div className="max-w-[18rem] space-y-0.5">
        <div className="flex items-center gap-2">
          <EllipsisTooltip
            text={label}
            className="text-sm font-medium"
            contentClassName="max-w-xs"
          />
          {mapping.mappingStatus === 'NEEDS_REVIEW' ? (
            <StatusBadge tone="warn">Tinjau</StatusBadge>
          ) : null}
        </div>
        <p className="text-muted-foreground num truncate text-xs">{mapping.variantSku}</p>
      </div>
    );
  }

  // "Status": the sync badge (Sudah sinkron / gagal / menunggu), or off/— when not syncing.
  function renderSyncStatus(mapping: MarketplaceListingMapping | null) {
    if (!mapping) return <span className="text-muted-foreground">—</span>;
    if (!mapping.syncEnabled)
      return <span className="text-muted-foreground text-xs">Sinkron mati</span>;
    return <SyncStatusBadge mapping={mapping} />;
  }

  // "Terakhir sinkron": when the last stock push landed.
  function renderLastSync(mapping: MarketplaceListingMapping | null) {
    if (!mapping?.lastSyncedAt) return <span className="text-muted-foreground">—</span>;
    return (
      <span className="text-muted-foreground num text-xs" suppressHydrationWarning>
        {formatDateTime(mapping.lastSyncedAt)}
      </span>
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
            {connection?.provider === 'LAZADA' ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => void handleTestConnection()}
                  disabled={testMutation.isPending}
                >
                  <PlugZap className="size-4" />
                  {testMutation.isPending ? 'Mengetes...' : 'Test koneksi'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void handleRefreshToken()}
                  disabled={refreshMutation.isPending}
                >
                  <RefreshCw className="size-4" />
                  {refreshMutation.isPending ? 'Memperbarui...' : 'Perbarui token'}
                </Button>
              </>
            ) : null}
            <Button
              variant="outline"
              onClick={() => void handleRerunAutoMap()}
              disabled={rerunMutation.isPending || totalListings === 0}
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

      <MarketplaceHealthPanel connectionId={connectionId} />

      {canManage && connection?.provider === 'LAZADA' ? (
        <SyncWarehouseCard
          connectionId={connectionId}
          syncWarehouseCode={connection.syncWarehouseCode}
          knownWarehouseCodes={connection.knownWarehouseCodes}
        />
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setPage(1);
            }}
            placeholder="Cari SKU / nama / ID listing"
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as ListingStatusFilter | typeof ALL_STATUS);
            setPage(1);
          }}
          className="w-full sm:w-52"
          aria-label="Filter status listing"
        >
          <option value={ALL_STATUS}>{LISTING_STATUS_LABELS.all}</option>
          {LISTING_STATUS_FILTERS.map((value) => (
            <option key={value} value={value}>
              {LISTING_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>

      {listingsQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : listingsQuery.error ? (
        <ErrorState title="Gagal memuat listing" onRetry={() => void listingsQuery.refetch()} />
      ) : listings.length === 0 ? (
        hasFilter ? (
          <EmptyState
            icon={Search}
            title="Tidak ada listing yang cocok"
            description="Coba ubah kata kunci atau filter status."
          />
        ) : (
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
        )
      ) : (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            <span className="num text-foreground font-medium">{totalListings}</span> listing
            {hasFilter ? ' cocok dengan filter' : ''}
          </p>

          <div className="hidden overflow-x-auto rounded-xl border sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Listing</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                  <TableHead>Dikaitkan ke</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Terakhir sinkron</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listings.map((listing) => (
                  <TableRow key={listing.marketplaceProductId}>
                    <TableCell>
                      <div className="max-w-[450px]">
                        <EllipsisTooltip
                          text={listing.externalProductName}
                          className="font-medium"
                          contentClassName="max-w-xs"
                        />
                        <EllipsisTooltip
                          text={listingSubtitle(listing)}
                          className="text-muted-foreground text-xs"
                          contentClassName="max-w-xs"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="num text-right">{listing.stock}</TableCell>
                    <TableCell>{renderLinkedTo(listing.mapping)}</TableCell>
                    <TableCell>{renderSyncStatus(listing.mapping)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {renderLastSync(listing.mapping)}
                    </TableCell>
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
                    <p className="text-muted-foreground text-xs break-words">
                      {listingSubtitle(listing)}
                    </p>
                  </div>
                  <p className="text-muted-foreground shrink-0 text-sm">
                    Stok <span className="num text-foreground font-medium">{listing.stock}</span>
                  </p>
                </div>
                {listing.mapping ? (
                  <dl className="mt-3 space-y-2">
                    <div>
                      <dt className="text-muted-foreground text-xs">Dikaitkan ke</dt>
                      <dd className="mt-0.5">{renderLinkedTo(listing.mapping)}</dd>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {renderSyncStatus(listing.mapping)}
                      {listing.mapping.lastSyncedAt ? (
                        <span className="text-muted-foreground text-xs">
                          · Sinkron {renderLastSync(listing.mapping)}
                        </span>
                      ) : null}
                    </div>
                  </dl>
                ) : null}
                <div className="mt-3">{renderListingActions(listing)}</div>
              </div>
            ))}
          </div>

          {listingsMeta ? (
            <TablePagination
              page={listingsMeta.page}
              pageSize={listingsMeta.pageSize}
              total={listingsMeta.total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          ) : null}
        </div>
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
