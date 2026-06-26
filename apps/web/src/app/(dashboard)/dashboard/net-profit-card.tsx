'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { format, startOfMonth } from 'date-fns';
import { ChevronRight } from 'lucide-react';

import { ErrorState } from '@/components/error-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useNetProfitReportQuery } from '@/modules/reporting/hooks/use-reporting';
import type { NetProfitSummary } from '@/modules/reporting/types';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';

const REPORT_HREF = '/dashboard/reports/net-profit' as Route;

function monthLabel(): string {
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date());
}

/**
 * Home money panel — mounted ONLY when the user has `finance.view` (gated at the call
 * site in dashboard-home), so STAFF neither sees it nor fires the gated fetch. Shows net
 * profit for the CURRENT MONTH (gross profit − operating expenses), reusing the Net P&L
 * report query. Monthly, not daily, because opex (sewa/gaji) is monthly — a daily net is
 * mostly just gross profit.
 */
export function NetProfitCard() {
  const now = new Date();
  const from = format(startOfMonth(now), 'yyyy-MM-dd');
  const to = format(now, 'yyyy-MM-dd');
  const { data, isPending, isError, refetch } = useNetProfitReportQuery({
    from,
    to,
    groupBy: 'month',
  });

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="gap-1 px-4">
        <CardTitle className="eyebrow text-primary" suppressHydrationWarning>
          Keuangan · {monthLabel()}
        </CardTitle>
        <CardDescription className="text-xs">
          Laba bersih bulan ini — omzet dikurangi modal & biaya operasional.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        {isPending ? (
          <NetProfitSkeleton />
        ) : isError || !data ? (
          <ErrorState
            title="Gagal memuat laba bersih"
            onRetry={() => void refetch()}
            className="p-5"
          />
        ) : (
          <NetProfitPanel summary={data.summary} />
        )}
      </CardContent>
    </Card>
  );
}

function NetProfitPanel({ summary }: { summary: NetProfitSummary }) {
  const netNegative = Number(summary.netProfit) < 0;

  return (
    <div className="space-y-3">
      <Link
        href={REPORT_HREF}
        className="hover:border-primary/40 hover:bg-accent/50 group block space-y-1 rounded-xl border p-4 transition-colors"
      >
        <span className="text-muted-foreground flex items-center justify-between text-xs">
          Laba bersih
          <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
        <span className={cn('num-display block', netNegative && 'text-signed-down')}>
          {formatCurrency(summary.netProfit)}
        </span>
        {summary.netMarginPct != null ? (
          <span className="text-muted-foreground block text-xs">
            Margin bersih {summary.netMarginPct}%
          </span>
        ) : null}
      </Link>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border p-3">
          <p className="text-muted-foreground text-xs">Omzet (net)</p>
          <p className="num text-base font-semibold">{formatCurrency(summary.grossRevenue)}</p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-muted-foreground text-xs">Biaya operasional</p>
          <p className="num text-base font-semibold">{formatCurrency(summary.operatingExpenses)}</p>
        </div>
      </div>
    </div>
  );
}

function NetProfitSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
