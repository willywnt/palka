'use client';

import dynamic from 'next/dynamic';
import { ArrowRight, Banknote, Coins, Info, Percent, TrendingDown, Wallet } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ValueRankList, type ValueRankRow } from '@/components/charts/bars';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';

import { channelLabel } from '../utils/channel-label';
import { formatPct, marginClass } from '../utils/format';
import { useProfitReportQuery, type ProfitReportParams } from '../hooks/use-reporting';
import type { ProfitBySku, ProfitMetrics, ProfitReport as ProfitReportData } from '../types';

const RevenueTrendChart = dynamic(
  () => import('@/components/charts/revenue-trend-chart').then((m) => m.RevenueTrendChart),
  { ssr: false, loading: () => <Skeleton className="h-[260px] w-full" /> },
);

/** The shared trailing metric cells (revenue / COGS / profit / margin / units). */
function MetricCells({ metrics }: { metrics: ProfitMetrics }) {
  return (
    <>
      <TableCell className="num text-right">{formatCurrency(metrics.grossRevenue)}</TableCell>
      <TableCell className="text-muted-foreground num text-right">
        {formatCurrency(metrics.cogs)}
      </TableCell>
      <TableCell
        className={cn(
          'num text-right font-medium',
          Number(metrics.grossProfit) < 0 && 'text-signed-down',
        )}
      >
        {formatCurrency(metrics.grossProfit)}
      </TableCell>
      <TableCell className={cn('num text-right', marginClass(metrics.grossMarginPct))}>
        {formatPct(metrics.grossMarginPct)}
      </TableCell>
      <TableCell className="text-muted-foreground num text-right">{metrics.unitsSold}</TableCell>
    </>
  );
}

function MetricHeadCells() {
  return (
    <>
      <TableHead className="text-right">Omzet</TableHead>
      <TableHead className="text-right">HPP</TableHead>
      <TableHead className="text-right">Laba</TableHead>
      <TableHead className="text-right">Margin</TableHead>
      <TableHead className="text-right">Unit</TableHead>
    </>
  );
}

/** A SKU profit ranking — a value bar per row (by gross profit) + the margin %. */
function SkuRankCard({
  title,
  rows,
  emptyHint,
}: {
  title: string;
  rows: ProfitBySku[];
  emptyHint: string;
}) {
  const rankRows: ValueRankRow[] = rows.map((row) => ({
    id: row.variantId ?? row.sku,
    label: row.name,
    sublabel: `${row.sku} · ${formatPct(row.grossMarginPct)}`,
    value: Math.max(0, Number(row.grossProfit)),
    flagged: Number(row.grossProfit) < 0,
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rankRows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{emptyHint}</p>
        ) : (
          <ValueRankList rows={rankRows} formatValue={(value) => formatCurrency(value)} />
        )}
      </CardContent>
    </Card>
  );
}

export function ProfitReport({
  params,
  onSeeChannels,
}: {
  params: ProfitReportParams;
  onSeeChannels?: () => void;
}) {
  const { data, isLoading, error, refetch } = useProfitReportQuery(params);

  if (isLoading) return <ProfitSkeleton />;

  if (error) {
    return (
      <ErrorState
        title="Gagal memuat laporan laba"
        description={error instanceof Error ? error.message : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  if (!data) return <ProfitSkeleton />;

  return <ProfitContent data={data} onSeeChannels={onSeeChannels} />;
}

function ProfitContent({
  data,
  onSeeChannels,
}: {
  data: ProfitReportData;
  onSeeChannels?: () => void;
}) {
  const { summary, returns } = data;

  if (data.byChannel.length === 0) {
    return (
      <Card>
        <CardContent className="py-2">
          <EmptyState
            icon={TrendingDown}
            title="Belum ada penjualan di rentang ini"
            description="Begitu ada penjualan kasir atau pesanan marketplace yang terkirim di periode ini, labanya langsung muncul di sini."
          />
        </CardContent>
      </Card>
    );
  }

  const costUnknownHint =
    summary.costUnknownLines > 0
      ? `${summary.costUnknownLines} baris belum ada modal — nggak ikut dihitung margin`
      : 'Semua barang terjual sudah ada modalnya';
  const revenueHint =
    returns.lineCount > 0
      ? `${summary.unitsSold} unit · sudah dipotong retur ${formatCurrency(returns.refundedRevenue)}`
      : `${summary.unitsSold} unit terjual`;

  const trendData = data.byPeriod.map((row) => ({
    period: row.period,
    revenue: Number(row.grossRevenue),
    profit: Number(row.grossProfit),
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Omzet bersih"
          value={formatCurrency(summary.grossRevenue)}
          icon={Banknote}
          tone="sky"
          hint={revenueHint}
        />
        <StatCard label="HPP" value={formatCurrency(summary.cogs)} icon={Coins} tone="amber" />
        <StatCard
          label="Laba kotor"
          value={formatCurrency(summary.grossProfit)}
          icon={Wallet}
          tone="emerald"
          accentClassName={Number(summary.grossProfit) < 0 ? 'text-signed-down' : undefined}
        />
        <StatCard
          label="Margin kotor"
          value={formatPct(summary.grossMarginPct)}
          icon={Percent}
          tone="violet"
          hint={
            <span className="inline-flex items-center gap-1">
              <Info className="size-3" />
              {costUnknownHint}
            </span>
          }
        />
      </div>

      {trendData.length > 0 ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-base">Tren laba &amp; omzet</CardTitle>
            {onSeeChannels ? (
              <Button variant="ghost" size="sm" onClick={onSeeChannels}>
                Bandingkan channel
                <ArrowRight className="size-4" />
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            <RevenueTrendChart data={trendData} />
            <details className="group mt-3">
              <summary className="text-muted-foreground hover:text-foreground cursor-pointer list-none text-xs select-none">
                <span className="group-open:hidden">
                  <span aria-hidden="true">▸</span> Lihat tabel per periode
                </span>
                <span className="hidden group-open:inline">
                  <span aria-hidden="true">▾</span> Sembunyikan tabel
                </span>
              </summary>
              <div className="mt-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Periode</TableHead>
                      <MetricHeadCells />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byPeriod.map((row) => (
                      <TableRow key={row.period}>
                        <TableCell className="num font-medium">{row.period}</TableCell>
                        <MetricCells metrics={row} />
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <SkuRankCard
          title="SKU laba tertinggi"
          rows={data.topSku}
          emptyHint="Belum ada penjualan yang modalnya sudah diisi."
        />
        <SkuRankCard
          title="SKU laba terendah"
          rows={data.bottomSku}
          emptyHint="Belum cukup varian buat diurutkan."
        />
      </div>

      {data.belowCost.length > 0 ? (
        <Card className="border-destructive/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-destructive flex items-center gap-2 text-base">
              <TrendingDown className="size-4" />
              Terjual di bawah modal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Varian</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Harga</TableHead>
                  <TableHead className="text-right">Modal</TableHead>
                  <TableHead className="text-right">Rugi/unit</TableHead>
                  <TableHead className="text-right">Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.belowCost.map((row, index) => (
                  <TableRow key={`${row.variantId ?? row.sku}-${row.channel}-${index}`}>
                    <TableCell>
                      <div className="font-medium">{row.name}</div>
                      <div className="text-muted-foreground text-xs">{row.sku}</div>
                    </TableCell>
                    <TableCell>{channelLabel(row.channel)}</TableCell>
                    <TableCell className="num text-right">
                      {formatCurrency(row.unitPrice)}
                    </TableCell>
                    <TableCell className="num text-right">{formatCurrency(row.unitCost)}</TableCell>
                    <TableCell className="text-signed-down num text-right font-medium">
                      {formatCurrency(row.lossPerUnit)}
                    </TableCell>
                    <TableCell className="num text-right">{row.units}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ProfitSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
