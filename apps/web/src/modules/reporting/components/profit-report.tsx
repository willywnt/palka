'use client';

import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Banknote, Coins, Info, Percent, TrendingDown, Wallet } from 'lucide-react';

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
import { profitExportUrl, useProfitReportQuery } from '../hooks/use-reporting';
import type {
  ProfitBySku,
  ProfitMetrics,
  ProfitPeriodGranularity,
  ProfitReport as ProfitReportData,
} from '../types';

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
          Number(metrics.grossProfit) < 0 && 'text-destructive',
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

function SkuTable({
  title,
  rows,
  emptyHint,
}: {
  title: string;
  rows: ProfitBySku[];
  emptyHint: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{emptyHint}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Varian</TableHead>
                <TableHead className="text-right">Laba</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.variantId ?? row.sku}`}>
                  <TableCell>
                    <div className="font-medium">{row.name}</div>
                    <div className="text-muted-foreground text-xs">{row.sku}</div>
                  </TableCell>
                  <TableCell className="num text-right font-medium">
                    {formatCurrency(row.grossProfit)}
                  </TableCell>
                  <TableCell className={cn('num text-right', marginClass(row.grossMarginPct))}>
                    {formatPct(row.grossMarginPct)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function ProfitReport() {
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [groupBy, setGroupBy] = useState<ProfitPeriodGranularity>('day');

  const params = rangeToParams(range, groupBy);
  const { data, isLoading, error } = useProfitReportQuery(params);

  return (
    <div className="space-y-6">
      <ReportRangeControls
        range={range}
        onRangeChange={setRange}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        exportUrl={profitExportUrl(params)}
      />

      {error ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          Gagal memuat laporan laba. {error instanceof Error ? error.message : 'Coba lagi.'}
        </div>
      ) : null}

      {isLoading || !data ? <ProfitSkeleton /> : <ProfitContent data={data} />}
    </div>
  );
}

function ProfitContent({ data }: { data: ProfitReportData }) {
  const { summary, returns } = data;
  const costUnknownHint =
    summary.costUnknownLines > 0
      ? `${summary.costUnknownLines} baris belum ada modal — nggak ikut dihitung margin`
      : 'Semua barang terjual sudah ada modalnya';
  const revenueHint =
    returns.lineCount > 0
      ? `${summary.unitsSold} unit · sudah dipotong retur ${formatCurrency(returns.refundedRevenue)}`
      : `${summary.unitsSold} unit terjual`;

  return (
    <>
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
          accentClassName={Number(summary.grossProfit) < 0 ? 'text-destructive' : undefined}
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Per channel</CardTitle>
        </CardHeader>
        <CardContent>
          {data.byChannel.length === 0 ? (
            <EmptyState
              icon={TrendingDown}
              title="Belum ada penjualan di rentang ini"
              description="Begitu ada penjualan kasir atau pesanan marketplace yang terkirim di periode ini, labanya langsung muncul di sini."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <MetricHeadCells />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byChannel.map((row) => (
                  <TableRow key={row.channel}>
                    <TableCell className="font-medium">{channelLabel(row.channel)}</TableCell>
                    <MetricCells metrics={row} />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {data.byPeriod.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Per periode</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <SkuTable
          title="SKU margin tertinggi"
          rows={data.topSku}
          emptyHint="Belum ada penjualan yang modalnya sudah diisi."
        />
        <SkuTable
          title="SKU margin terendah"
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
                    <TableCell className="text-destructive num text-right font-medium">
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
    </>
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
