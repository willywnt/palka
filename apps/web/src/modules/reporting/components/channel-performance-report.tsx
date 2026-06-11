'use client';

import dynamic from 'next/dynamic';
import { Banknote, Crown, Percent, Receipt, Store, Wallet } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { StatCard } from '@/components/stat-card';
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
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';

import { channelColor } from '../utils/channel-color';
import { channelLabel } from '../utils/channel-label';
import { formatPct, marginClass } from '../utils/format';
import { useChannelPerformanceQuery, type ProfitReportParams } from '../hooks/use-reporting';
import type { ChannelPerformanceReport as ChannelReportData } from '../types';

const ChannelDonutChart = dynamic(
  () => import('@/components/charts/channel-donut-chart').then((m) => m.ChannelDonutChart),
  { ssr: false, loading: () => <Skeleton className="h-[240px] w-full" /> },
);
const ChannelTrendChart = dynamic(
  () => import('@/components/charts/channel-trend-chart').then((m) => m.ChannelTrendChart),
  { ssr: false, loading: () => <Skeleton className="h-[260px] w-full" /> },
);

export function ChannelPerformanceReport({ params }: { params: ProfitReportParams }) {
  const { data, isLoading, error, refetch } = useChannelPerformanceQuery(params);

  if (isLoading) return <ChannelSkeleton />;

  if (error) {
    return (
      <ErrorState
        title="Gagal memuat laporan channel"
        description={error instanceof Error ? error.message : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  if (!data) return <ChannelSkeleton />;

  return <ChannelContent data={data} />;
}

function ChannelContent({ data }: { data: ChannelReportData }) {
  const { summary } = data;

  if (data.byChannel.length === 0) {
    return (
      <Card>
        <CardContent className="py-2">
          <EmptyState
            icon={Store}
            title="Belum ada penjualan di rentang ini"
            description="Begitu ada penjualan kasir atau pesanan marketplace yang terkirim di periode ini, perbandingan antar-channel langsung muncul di sini."
          />
        </CardContent>
      </Card>
    );
  }

  const topRevenueRow = data.byChannel[0];
  const topMarginRow = summary.topByMargin
    ? data.byChannel.find((row) => row.channel === summary.topByMargin)
    : undefined;

  const colorOf = new Map(
    data.byChannel.map((row, index) => [row.channel, channelColor(row.channel, index)]),
  );
  const donutData = data.byChannel.map((row) => ({
    name: channelLabel(row.channel),
    value: Number(row.grossRevenue),
    color: colorOf.get(row.channel) ?? 'var(--chart-1)',
  }));
  const trendSeries = data.byChannel.map((row) => ({
    key: row.channel,
    label: channelLabel(row.channel),
    color: colorOf.get(row.channel) ?? 'var(--chart-1)',
  }));
  const trendData = data.trend.map((period) => {
    const datum: Record<string, number | string> = { period: period.period };
    for (const row of data.byChannel) {
      datum[row.channel] = Number(period.revenueByChannel[row.channel] ?? 0);
    }
    return datum;
  });

  const showDonut = data.byChannel.length >= 2;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Omzet bersih"
          value={formatCurrency(summary.totalGrossRevenue)}
          icon={Banknote}
          tone="sky"
          hint={`${summary.transactions} transaksi · ${summary.activeChannels} channel aktif`}
        />
        <StatCard
          label="Laba kotor"
          value={formatCurrency(summary.totalGrossProfit)}
          icon={Wallet}
          tone="emerald"
          accentClassName={Number(summary.totalGrossProfit) < 0 ? 'text-signed-down' : undefined}
          hint={
            <span className="inline-flex items-center gap-1">
              <Percent className="size-3" />
              Margin {formatPct(summary.grossMarginPct)}
            </span>
          }
        />
        <StatCard
          label="Channel teratas"
          value={topRevenueRow ? channelLabel(topRevenueRow.channel) : '—'}
          icon={Crown}
          tone="violet"
          hint={
            topRevenueRow
              ? `${formatPct(topRevenueRow.revenueSharePct)} dari omzet · ${formatCurrency(topRevenueRow.grossRevenue)}`
              : undefined
          }
        />
        <StatCard
          label="Margin terbaik"
          value={topMarginRow ? channelLabel(topMarginRow.channel) : '—'}
          icon={Receipt}
          tone="amber"
          hint={
            topMarginRow ? `Margin ${formatPct(topMarginRow.grossMarginPct)}` : 'Modal belum diisi'
          }
        />
      </div>

      <div className={cn('grid gap-4', showDonut && 'lg:grid-cols-3')}>
        {showDonut ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Porsi omzet</CardTitle>
            </CardHeader>
            <CardContent>
              <ChannelDonutChart
                data={donutData}
                centerPrimary={formatCurrency(summary.totalGrossRevenue)}
                centerSecondary="omzet bersih"
              />
              <ul className="mt-3 space-y-1.5">
                {data.byChannel.map((row) => (
                  <li key={row.channel} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: colorOf.get(row.channel) }}
                      />
                      {channelLabel(row.channel)}
                    </span>
                    <span className="num text-muted-foreground">
                      {formatPct(row.revenueSharePct)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <Card className={cn(showDonut && 'lg:col-span-2')}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tren omzet per channel</CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 ? (
              <ChannelTrendChart data={trendData} series={trendSeries} />
            ) : (
              <p className="text-muted-foreground py-8 text-center text-sm">
                Belum cukup data buat menggambar tren.
              </p>
            )}
            <details className="group mt-3">
              <summary className="text-muted-foreground hover:text-foreground cursor-pointer list-none text-xs select-none">
                <span className="group-open:hidden">
                  <span aria-hidden="true">▸</span> Lihat tabel tren
                </span>
                <span className="hidden group-open:inline">
                  <span aria-hidden="true">▾</span> Sembunyikan tabel
                </span>
              </summary>
              <div className="mt-3 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Periode</TableHead>
                      {data.byChannel.map((row) => (
                        <TableHead key={row.channel} className="text-right">
                          {channelLabel(row.channel)}
                        </TableHead>
                      ))}
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.trend.map((period) => (
                      <TableRow key={period.period}>
                        <TableCell className="num font-medium">{period.period}</TableCell>
                        {data.byChannel.map((row) => (
                          <TableCell
                            key={row.channel}
                            className="text-muted-foreground num text-right"
                          >
                            {formatCurrency(period.revenueByChannel[row.channel] ?? '0')}
                          </TableCell>
                        ))}
                        <TableCell className="num text-right font-medium">
                          {formatCurrency(period.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Perbandingan channel</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 sm:hidden">
            {data.byChannel.map((row) => (
              <li key={row.channel} className="border-border/70 rounded-lg border p-3">
                <p className="flex items-center gap-2 font-medium">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: colorOf.get(row.channel) }}
                  />
                  {channelLabel(row.channel)}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs">Omzet bersih</dt>
                    <dd className="num">{formatCurrency(row.grossRevenue)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Laba</dt>
                    <dd
                      className={cn(
                        'num font-medium',
                        Number(row.grossProfit) < 0 && 'text-signed-down',
                      )}
                    >
                      {formatCurrency(row.grossProfit)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Margin</dt>
                    <dd className={cn('num', marginClass(row.grossMarginPct))}>
                      {formatPct(row.grossMarginPct)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Porsi</dt>
                    <dd className="num">{formatPct(row.revenueSharePct)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Unit</dt>
                    <dd className="num">{row.unitsSold}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Transaksi</dt>
                    <dd className="num">{row.transactions}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">AOV</dt>
                    <dd className="num">{formatCurrency(row.avgOrderValue)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Retur</dt>
                    <dd className="num">{formatPct(row.returnRatePct)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Omzet bersih</TableHead>
                  <TableHead className="text-right">Porsi</TableHead>
                  <TableHead className="text-right">Laba</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Unit</TableHead>
                  <TableHead className="text-right">Transaksi</TableHead>
                  <TableHead className="text-right">AOV</TableHead>
                  <TableHead className="text-right">Retur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byChannel.map((row) => (
                  <TableRow key={row.channel}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: colorOf.get(row.channel) }}
                        />
                        {channelLabel(row.channel)}
                      </span>
                    </TableCell>
                    <TableCell className="num text-right">
                      {formatCurrency(row.grossRevenue)}
                    </TableCell>
                    <TableCell className="text-muted-foreground num text-right">
                      {formatPct(row.revenueSharePct)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'num text-right font-medium',
                        Number(row.grossProfit) < 0 && 'text-signed-down',
                      )}
                    >
                      {formatCurrency(row.grossProfit)}
                    </TableCell>
                    <TableCell className={cn('num text-right', marginClass(row.grossMarginPct))}>
                      {formatPct(row.grossMarginPct)}
                    </TableCell>
                    <TableCell className="text-muted-foreground num text-right">
                      {row.unitsSold}
                    </TableCell>
                    <TableCell className="text-muted-foreground num text-right">
                      {row.transactions}
                    </TableCell>
                    <TableCell className="num text-right">
                      {formatCurrency(row.avgOrderValue)}
                    </TableCell>
                    <TableCell className="text-muted-foreground num text-right">
                      {formatPct(row.returnRatePct)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ChannelSkeleton() {
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
