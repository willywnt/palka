'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Banknote, Coins, Download, Info, Percent, TrendingDown, Wallet } from 'lucide-react';

import { DateRangePicker } from '@/components/date-range-picker';
import { EmptyState } from '@/components/empty-state';
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
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';

import {
  profitExportUrl,
  useProfitReportQuery,
  type ProfitReportParams,
} from '../hooks/use-reporting';
import type {
  ProfitBySku,
  ProfitMetrics,
  ProfitPeriodGranularity,
  ProfitReport as ProfitReportData,
} from '../types';

const GROUP_OPTIONS: { value: ProfitPeriodGranularity; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const CHANNEL_LABELS: Record<string, string> = {
  POS: 'POS / counter',
  SHOPEE: 'Shopee',
  TOKOPEDIA: 'Tokopedia',
  LAZADA: 'Lazada',
};

function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}

function formatPct(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

function marginClass(value: number | null): string | undefined {
  if (value === null) return 'text-muted-foreground';
  if (value < 0) return 'text-destructive';
  return undefined;
}

function rangeToParams(
  range: DateRange | undefined,
  groupBy: ProfitPeriodGranularity,
): ProfitReportParams {
  return {
    groupBy,
    ...(range?.from ? { from: format(range.from, 'yyyy-MM-dd') } : {}),
    ...(range?.to ? { to: format(range.to, 'yyyy-MM-dd') } : {}),
  };
}

/** The shared trailing metric cells (revenue / COGS / profit / margin / units). */
function MetricCells({ metrics }: { metrics: ProfitMetrics }) {
  return (
    <>
      <TableCell className="text-right tabular-nums">
        {formatCurrency(metrics.grossRevenue)}
      </TableCell>
      <TableCell className="text-muted-foreground text-right tabular-nums">
        {formatCurrency(metrics.cogs)}
      </TableCell>
      <TableCell
        className={cn(
          'text-right font-medium tabular-nums',
          Number(metrics.grossProfit) < 0 && 'text-destructive',
        )}
      >
        {formatCurrency(metrics.grossProfit)}
      </TableCell>
      <TableCell className={cn('text-right tabular-nums', marginClass(metrics.grossMarginPct))}>
        {formatPct(metrics.grossMarginPct)}
      </TableCell>
      <TableCell className="text-muted-foreground text-right tabular-nums">
        {metrics.unitsSold}
      </TableCell>
    </>
  );
}

function MetricHeadCells() {
  return (
    <>
      <TableHead className="text-right">Revenue</TableHead>
      <TableHead className="text-right">COGS</TableHead>
      <TableHead className="text-right">Profit</TableHead>
      <TableHead className="text-right">Margin</TableHead>
      <TableHead className="text-right">Units</TableHead>
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
                <TableHead>Variant</TableHead>
                <TableHead className="text-right">Profit</TableHead>
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
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(row.grossProfit)}
                  </TableCell>
                  <TableCell
                    className={cn('text-right tabular-nums', marginClass(row.grossMarginPct))}
                  >
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} placeholder="Last 30 days" />
          <div className="flex items-center gap-1">
            {GROUP_OPTIONS.map((option) => (
              <Button
                key={option.value}
                variant={groupBy === option.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setGroupBy(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={profitExportUrl(params)} download>
            <Download className="size-4" />
            Export CSV
          </a>
        </Button>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          Failed to load the profit report.{' '}
          {error instanceof Error ? error.message : 'Please try again.'}
        </div>
      ) : null}

      {isLoading || !data ? <ProfitSkeleton /> : <ProfitContent data={data} />}
    </div>
  );
}

function ProfitContent({ data }: { data: ProfitReportData }) {
  const { summary } = data;
  const costUnknownHint =
    summary.costUnknownLines > 0
      ? `${summary.costUnknownLines} line(s) have no cost yet — excluded from margin`
      : 'All sold lines have a known cost';

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Gross revenue"
          value={formatCurrency(summary.grossRevenue)}
          icon={Banknote}
          tone="sky"
          hint={`${summary.unitsSold} units sold`}
        />
        <StatCard label="COGS" value={formatCurrency(summary.cogs)} icon={Coins} tone="amber" />
        <StatCard
          label="Gross profit"
          value={formatCurrency(summary.grossProfit)}
          icon={Wallet}
          tone="emerald"
          accentClassName={Number(summary.grossProfit) < 0 ? 'text-destructive' : undefined}
        />
        <StatCard
          label="Gross margin"
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
          <CardTitle className="text-base">By channel</CardTitle>
        </CardHeader>
        <CardContent>
          {data.byChannel.length === 0 ? (
            <EmptyState
              icon={TrendingDown}
              title="No sales in this range"
              description="Once POS sales or shipped marketplace orders land in this period, profit shows up here."
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
            <CardTitle className="text-base">By period</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <MetricHeadCells />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byPeriod.map((row) => (
                  <TableRow key={row.period}>
                    <TableCell className="font-medium tabular-nums">{row.period}</TableCell>
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
          title="Top margin SKUs"
          rows={data.topSku}
          emptyHint="No sales with a known cost yet."
        />
        <SkuTable
          title="Lowest margin SKUs"
          rows={data.bottomSku}
          emptyHint="Not enough variants to rank yet."
        />
      </div>

      {data.belowCost.length > 0 ? (
        <Card className="border-destructive/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-destructive flex items-center gap-2 text-base">
              <TrendingDown className="size-4" />
              Sold below cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variant</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Loss/unit</TableHead>
                  <TableHead className="text-right">Units</TableHead>
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
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.unitPrice)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.unitCost)}
                    </TableCell>
                    <TableCell className="text-destructive text-right font-medium tabular-nums">
                      {formatCurrency(row.lossPerUnit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.units}</TableCell>
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
