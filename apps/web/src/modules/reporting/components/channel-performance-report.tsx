'use client';

import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Banknote, Crown, Percent, Receipt, Store, Wallet } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
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

import { ReportRangeControls, rangeToParams } from './report-range-controls';
import { channelLabel } from '../utils/channel-label';
import { formatPct, marginClass } from '../utils/format';
import { channelPerformanceExportUrl, useChannelPerformanceQuery } from '../hooks/use-reporting';
import type { ChannelPerformanceReport as ChannelReportData } from '../types';

export function ChannelPerformanceReport() {
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  const params = rangeToParams(range, groupBy);
  const { data, isLoading, error } = useChannelPerformanceQuery(params);

  return (
    <div className="space-y-6">
      <ReportRangeControls
        range={range}
        onRangeChange={setRange}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        exportUrl={channelPerformanceExportUrl(params)}
      />

      {error ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          Gagal memuat laporan channel. {error instanceof Error ? error.message : 'Coba lagi.'}
        </div>
      ) : null}

      {isLoading || !data ? <ChannelSkeleton /> : <ChannelContent data={data} />}
    </div>
  );
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

  return (
    <>
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
          accentClassName={Number(summary.totalGrossProfit) < 0 ? 'text-destructive' : undefined}
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Perbandingan channel</CardTitle>
        </CardHeader>
        <CardContent>
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
                  <TableCell className="font-medium">{channelLabel(row.channel)}</TableCell>
                  <TableCell className="num text-right">
                    {formatCurrency(row.grossRevenue)}
                  </TableCell>
                  <TableCell className="text-muted-foreground num text-right">
                    {formatPct(row.revenueSharePct)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'num text-right font-medium',
                      Number(row.grossProfit) < 0 && 'text-destructive',
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
                  <TableCell
                    className={cn(
                      'num text-right',
                      row.returnRatePct && row.returnRatePct > 0
                        ? 'text-destructive'
                        : 'text-muted-foreground',
                    )}
                  >
                    {formatPct(row.returnRatePct)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data.trend.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tren omzet per channel</CardTitle>
          </CardHeader>
          <CardContent>
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
                      <TableCell key={row.channel} className="text-muted-foreground num text-right">
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
          </CardContent>
        </Card>
      ) : null}
    </>
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
