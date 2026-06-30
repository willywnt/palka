'use client';

import { useEffect, useRef, useState } from 'react';
import { Link2Off, Loader2, RadarIcon, RefreshCw, ShieldCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ErrorState } from '@/components/error-state';
import { StatusBadge } from '@/components/status-badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDateTime } from '@/lib/formatters';
import { useHasPermission } from '@/modules/users/hooks/use-org';

import { marketplaceKeys } from '../hooks/use-marketplace-connections';
import {
  useDriftCheckMutation,
  useMarketplaceConnectionHealthQuery,
  useSyncAllMutation,
  useSyncStatusQuery,
} from '../hooks/use-marketplace-health';
import {
  marketplaceListingKeys,
  useSyncNowMutation,
  useUnmapListingMutation,
} from '../hooks/use-marketplace-listings';
import {
  MARKETPLACE_HEALTH_LABELS,
  STOCK_DRIFT_STATUS_LABELS,
  STOCK_DRIFT_STATUS_TONE,
} from '../types';
import type { MarketplaceConnectionHealth, StockDriftLine } from '../types';
import { formatTokenExpiryRelative } from '../utils/token-lifecycle';

function HealthMetric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}

function HealthSummary({ health }: { health: MarketplaceConnectionHealth }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <HealthMetric label="Token">
        <span suppressHydrationWarning>{formatTokenExpiryRelative(health.tokenExpiresAt)}</span>
        {health.tokenExpiringSoon ? (
          <StatusBadge tone="warn" className="mt-1">
            Segera kedaluwarsa
          </StatusBadge>
        ) : null}
      </HealthMetric>
      <HealthMetric label="Sinkron aktif">
        <span className="num">{health.syncEnabledCount}</span>
        <span className="text-muted-foreground"> / {health.mappedCount} terkait</span>
      </HealthMetric>
      <HealthMetric label="Perlu ditinjau">
        <span className="num">{health.needsReviewCount}</span>
      </HealthMetric>
      <HealthMetric label="Gagal sinkron">
        <span className="num">{health.failedSyncCount}</span>
      </HealthMetric>
      <HealthMetric label="Sinkron 7 hari">
        <span className="text-status-ok num">{health.recentSync.success}</span>
        <span className="text-muted-foreground"> berhasil · </span>
        <span className="text-destructive num">{health.recentSync.failed}</span>
        <span className="text-muted-foreground"> gagal</span>
      </HealthMetric>
    </div>
  );
}

function DriftDelta({ line }: { line: StockDriftLine }) {
  if (line.delta === null) return <span className="text-muted-foreground">—</span>;
  const sign = line.delta > 0 ? '+' : '';
  return (
    <span className="num font-medium">
      {sign}
      {line.delta}
    </span>
  );
}

export function MarketplaceHealthPanel({ connectionId }: { connectionId: string }) {
  const { allowed: canManage } = useHasPermission('marketplace.manage');
  const queryClient = useQueryClient();
  const healthQuery = useMarketplaceConnectionHealthQuery(connectionId);
  const driftMutation = useDriftCheckMutation(connectionId);
  const syncNowMutation = useSyncNowMutation(connectionId);
  const unmapMutation = useUnmapListingMutation(connectionId);
  const syncAllMutation = useSyncAllMutation(connectionId);
  const syncStatusQuery = useSyncStatusQuery(connectionId, canManage);

  const health = healthQuery.data;
  const report = driftMutation.data;
  // Listings just unlinked from this table — dropped optimistically so they vanish on click.
  const [unlinkedIds, setUnlinkedIds] = useState<ReadonlySet<string>>(new Set());
  // Surface the actionable rows (over/under/missing); in-sync + just-unlinked listings stay hidden.
  const problems = (report?.summary.lines.filter((line) => line.status !== 'in_sync') ?? []).filter(
    (line) => !unlinkedIds.has(line.marketplaceProductId),
  );

  const [recentlyClicked, setRecentlyClicked] = useState<ReadonlySet<string>>(new Set());
  const [watching, setWatching] = useState(false);
  // `inFlight` = the listing ids currently syncing (per-listing gating, not just a count).
  const inFlightIds = syncStatusQuery.data?.inFlight ?? [];
  const inFlightCount = inFlightIds.length;
  // Global "is anything syncing" — gates the bulk + drift-check buttons + the watcher.
  const syncing =
    watching ||
    inFlightCount > 0 ||
    recentlyClicked.size > 0 ||
    syncAllMutation.isPending ||
    syncNowMutation.isPending;
  // Per-listing: ONLY the listing actually syncing is busy, so other listings stay clickable.
  const isListingSyncing = (id: string) => inFlightIds.includes(id) || recentlyClicked.has(id);

  /** Optimistically mark a listing busy on click until the in-flight poll reflects it. */
  function markClicked(id: string) {
    setRecentlyClicked((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setRecentlyClicked((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 2500);
  }

  // Refs so the watch loop (deps: [watching]) doesn't churn every render.
  const driftMutationRef = useRef(driftMutation);
  driftMutationRef.current = driftMutation;
  const refetchSyncStatusRef = useRef(syncStatusQuery.refetch);
  refetchSyncStatusRef.current = syncStatusQuery.refetch;
  const watchStartedAt = useRef(0);
  const sawActive = useRef(false);

  /** Arm the watcher after triggering a manual sync. */
  function watchSync() {
    watchStartedAt.current = Date.now();
    sawActive.current = false;
    setWatching(true);
  }

  // Bulletproof completion: actively poll the in-flight count and finish when the queued jobs
  // drain — deterministic even for a fast job the periodic poll skips (a short grace timeout
  // catches a sync that finished before we ever saw it active). On finish: revalidate the
  // health + listing statuses, re-run drift so the table reflects the push, and auto-close it
  // once everything is back in sync.
  useEffect(() => {
    if (!watching) return;
    let cancelled = false;

    const finish = () => {
      if (cancelled) return;
      setWatching(false);
      setRecentlyClicked(new Set());
      void queryClient.invalidateQueries({ queryKey: marketplaceKeys.healthDetail(connectionId) });
      void queryClient.invalidateQueries({ queryKey: marketplaceListingKeys.all(connectionId) });
      const drift = driftMutationRef.current;
      if (!drift.data) return; // No drift table open → nothing to re-check.
      drift.mutate(undefined, {
        onSuccess: (fresh) => {
          if (fresh.summary.lines.every((line) => line.status === 'in_sync')) {
            drift.reset();
            toast.success('Semua listing sudah sinkron', {
              description: 'Tidak ada lagi selisih stok — panel drift ditutup.',
            });
          }
        },
      });
    };

    const tick = async () => {
      const res = await refetchSyncStatusRef.current();
      if (cancelled) return;
      if ((res.data?.inFlight?.length ?? 0) > 0) {
        sawActive.current = true;
        return;
      }
      if (sawActive.current || Date.now() - watchStartedAt.current > 6000) finish();
    };

    void tick();
    const id = setInterval(() => void tick(), 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [watching, connectionId, queryClient]);

  async function handleDriftCheck() {
    try {
      await driftMutation.mutateAsync();
    } catch (error) {
      toast.error('Gagal memeriksa drift', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  async function handleSyncAll() {
    try {
      const result = await syncAllMutation.mutateAsync();
      if (result.queued > 0) watchSync();
      toast.success('Sinkronisasi dimulai', {
        description:
          result.queued > 0
            ? `${result.queued} produk sedang dikirim ke marketplace.`
            : 'Tidak ada listing dengan sinkron aktif untuk dikirim.',
      });
    } catch (error) {
      toast.error('Gagal sinkron semua', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  async function handleSyncNow(marketplaceProductId: string) {
    try {
      await syncNowMutation.mutateAsync(marketplaceProductId);
      watchSync();
      toast.success('Sinkronisasi dimulai', {
        description: 'Stok sedang dikirim ke marketplace.',
      });
    } catch (error) {
      toast.error('Gagal sinkronisasi', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  async function handleUnlink(marketplaceProductId: string) {
    try {
      await unmapMutation.mutateAsync(marketplaceProductId);
      // Drop it from the table at once + refresh health/listings (the next drift check excludes it).
      setUnlinkedIds((prev) => new Set(prev).add(marketplaceProductId));
      void queryClient.invalidateQueries({ queryKey: marketplaceKeys.healthDetail(connectionId) });
      void queryClient.invalidateQueries({ queryKey: marketplaceListingKeys.all(connectionId) });
      toast.success('Kaitan diputus', { description: 'Listing dilepas dari pemantauan drift.' });
    } catch (error) {
      toast.error('Gagal melepas kaitan', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  function renderSyncAction(line: StockDriftLine) {
    if (!canManage) return null;
    // A listing that's GONE at the marketplace can't be synced — offer to unlink it (it then drops
    // off this table). Data in the shop stays; re-import + re-map to reconnect.
    if (line.status === 'missing_external') {
      return (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive h-9 sm:h-8"
              disabled={unmapMutation.isPending}
            >
              <Link2Off className="size-4" />
              Putuskan kaitan
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Putuskan kaitan listing ini?</AlertDialogTitle>
              <AlertDialogDescription>
                Listing ini tidak ada lagi di marketplace. Memutus kaitan menghentikan pemantauan
                drift untuk listing ini — data produk di tokomu tetap aman. Untuk menyambung lagi:
                impor ulang listing, lalu kaitkan ke listing yang benar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                className={buttonVariants({ variant: 'destructive' })}
                onClick={() => void handleUnlink(line.marketplaceProductId)}
              >
                Putuskan kaitan
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );
    }
    if (!line.syncEnabled) {
      return <span className="text-muted-foreground text-xs">Sinkron mati</span>;
    }
    const rowSyncing = isListingSyncing(line.marketplaceProductId);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={rowSyncing}
            onClick={() => {
              markClicked(line.marketplaceProductId);
              void handleSyncNow(line.marketplaceProductId);
            }}
          >
            {rowSyncing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            <span className="sr-only">Kirim stok sekarang</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Kirim stok internal ke marketplace</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="eyebrow text-primary">Kesehatan &amp; drift</p>
            {health ? (
              <StatusBadge tone={health.tone}>{MARKETPLACE_HEALTH_LABELS[health.tone]}</StatusBadge>
            ) : null}
          </div>
          <p className="text-muted-foreground text-sm">
            Bandingkan stok di marketplace dengan stok internal (sumber kebenaran). Internal tidak
            diubah — drift cuma ditampilkan, perbaikannya lewat sinkronisasi.
          </p>
        </div>
        {canManage ? (
          <Button
            variant="outline"
            onClick={() => void handleDriftCheck()}
            disabled={driftMutation.isPending || syncing}
            className="shrink-0"
          >
            <RadarIcon className="size-4" />
            {driftMutation.isPending ? 'Memeriksa...' : 'Periksa drift'}
          </Button>
        ) : null}
      </div>

      {healthQuery.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : healthQuery.error ? (
        <ErrorState title="Gagal memuat kesehatan" onRetry={() => void healthQuery.refetch()} />
      ) : health ? (
        <HealthSummary health={health} />
      ) : null}

      {report ? (
        <div className="space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="ok">
              <span className="num">{report.summary.inSync}</span> sinkron
            </StatusBadge>
            <StatusBadge tone={report.summary.drifted > 0 ? 'warn' : 'neutral'}>
              <span className="num">{report.summary.drifted}</span> drift
            </StatusBadge>
            <StatusBadge tone={report.summary.missingExternal > 0 ? 'warn' : 'neutral'}>
              <span className="num">{report.summary.missingExternal}</span> hilang
            </StatusBadge>
            {report.summary.unmappedExternal > 0 ? (
              <StatusBadge tone="info">
                <span className="num">{report.summary.unmappedExternal}</span> belum dikaitkan
              </StatusBadge>
            ) : null}
            <span className="text-muted-foreground text-xs">
              Diperiksa <span suppressHydrationWarning>{formatDateTime(report.checkedAt)}</span>
            </span>
            {canManage ? (
              syncing ? (
                <span className="text-muted-foreground ml-auto inline-flex items-center gap-1.5 text-xs">
                  <Loader2 className="size-3.5 animate-spin" />
                  {inFlightCount > 0
                    ? `${inFlightCount} sinkronisasi berjalan`
                    : 'Memproses sinkronisasi…'}
                </span>
              ) : problems.length > 0 ? (
                <button
                  type="button"
                  onClick={() => void handleSyncAll()}
                  className="text-primary ml-auto inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
                >
                  <RefreshCw className="size-3.5" />
                  Sinkronkan semua
                </button>
              ) : null
            ) : null}
          </div>

          {problems.length === 0 ? (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <ShieldCheck className="text-status-ok size-4" />
              Semua listing terkait sudah sinkron dengan stok internal.
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-xl border sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Listing</TableHead>
                      <TableHead className="text-right">Internal</TableHead>
                      <TableHead className="text-right">Marketplace</TableHead>
                      <TableHead className="text-right">Selisih</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {problems.map((line) => (
                      <TableRow key={line.marketplaceProductId}>
                        <TableCell>
                          <div className="font-medium">{line.productName}</div>
                          <div className="text-muted-foreground text-xs">{line.variantSku}</div>
                        </TableCell>
                        <TableCell className="num text-right">{line.internalAvailable}</TableCell>
                        <TableCell className="num text-right">
                          {line.externalStock ?? '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <DriftDelta line={line} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={STOCK_DRIFT_STATUS_TONE[line.status]}>
                            {STOCK_DRIFT_STATUS_LABELS[line.status]}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="text-right">{renderSyncAction(line)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 sm:hidden">
                {problems.map((line) => (
                  <div key={line.marketplaceProductId} className="bg-card rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium break-words">{line.productName}</p>
                        <p className="text-muted-foreground text-xs">{line.variantSku}</p>
                      </div>
                      <StatusBadge tone={STOCK_DRIFT_STATUS_TONE[line.status]}>
                        {STOCK_DRIFT_STATUS_LABELS[line.status]}
                      </StatusBadge>
                    </div>
                    <div className="text-muted-foreground mt-3 flex items-center gap-4 text-sm">
                      <span>
                        Internal{' '}
                        <span className="text-foreground num font-medium">
                          {line.internalAvailable}
                        </span>
                      </span>
                      <span>
                        Marketplace{' '}
                        <span className="text-foreground num font-medium">
                          {line.externalStock ?? '—'}
                        </span>
                      </span>
                      <span>
                        Selisih <DriftDelta line={line} />
                      </span>
                    </div>
                    <div className="mt-3 flex justify-end">{renderSyncAction(line)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
