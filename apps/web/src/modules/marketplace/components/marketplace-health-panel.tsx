'use client';

import { RadarIcon, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { ErrorState } from '@/components/error-state';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
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

import {
  useDriftCheckMutation,
  useMarketplaceConnectionHealthQuery,
} from '../hooks/use-marketplace-health';
import { useSyncNowMutation } from '../hooks/use-marketplace-listings';
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
  const healthQuery = useMarketplaceConnectionHealthQuery(connectionId);
  const driftMutation = useDriftCheckMutation(connectionId);
  const syncNowMutation = useSyncNowMutation(connectionId);

  const health = healthQuery.data;
  const report = driftMutation.data;
  // Surface the actionable rows (over/under/missing); in-sync listings stay collapsed.
  const problems = report?.summary.lines.filter((line) => line.status !== 'in_sync') ?? [];

  async function handleDriftCheck() {
    try {
      await driftMutation.mutateAsync();
    } catch (error) {
      toast.error('Gagal memeriksa drift', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  async function handleSyncNow(marketplaceProductId: string) {
    try {
      await syncNowMutation.mutateAsync(marketplaceProductId);
      toast.success('Sinkronisasi diantrekan', { description: 'Stok akan dikirim sebentar lagi.' });
    } catch (error) {
      toast.error('Gagal sinkronisasi', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
      });
    }
  }

  function renderSyncAction(line: StockDriftLine) {
    if (!canManage) return null;
    if (!line.syncEnabled) {
      return <span className="text-muted-foreground text-xs">Sinkron mati</span>;
    }
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={syncNowMutation.isPending}
            onClick={() => void handleSyncNow(line.marketplaceProductId)}
          >
            <RefreshCw className="size-4" />
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
            disabled={driftMutation.isPending}
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
            <StatusBadge tone={report.summary.unmappedExternal > 0 ? 'info' : 'neutral'}>
              <span className="num">{report.summary.unmappedExternal}</span> belum dipetakan
            </StatusBadge>
            <span className="text-muted-foreground text-xs">
              Diperiksa <span suppressHydrationWarning>{formatDateTime(report.checkedAt)}</span>
            </span>
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
