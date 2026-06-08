'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  AlertTriangle,
  Boxes,
  ChevronRight,
  PackageX,
  ShoppingCart,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CompositionBar } from '@/components/charts/bars';
import { ImageThumb } from '@/components/image-thumb';
import { NumberDelta } from '@/components/number-delta';
import { StatCard, type StatTone } from '@/components/stat-card';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDateTime } from '@/lib/formatters';

import { REORDER_DEFAULTS } from '../config';
import { useInventoryDashboardQuery, useReorderReportQuery } from '../hooks/use-inventory';
import { stockReasonLabel } from '../utils/reason-display';

const StockFlowChart = dynamic(
  () => import('@/components/charts/stock-flow-chart').then((m) => m.StockFlowChart),
  { ssr: false, loading: () => <Skeleton className="h-[240px] w-full" /> },
);

export function InventoryDashboard() {
  const { data, isLoading, error } = useInventoryDashboardQuery();
  const reorderQuery = useReorderReportQuery({
    windowDays: REORDER_DEFAULTS.windowDays,
    leadTimeDays: REORDER_DEFAULTS.leadTimeDays,
    targetCoverDays: REORDER_DEFAULTS.targetCoverDays,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
        {error instanceof Error ? error.message : 'Gagal memuat dashboard.'}
      </div>
    );
  }

  const { summary, lowStock, recentMovements, dailyMovement } = data;
  const reorder = reorderQuery.data?.summary;
  const hasFlow = dailyMovement.some((point) => point.in > 0 || point.out > 0);

  const kpis: Array<{
    label: string;
    value: string;
    icon: LucideIcon;
    tone: StatTone;
    hint?: string;
    accentClassName?: string;
  }> = [
    {
      label: 'Nilai stok',
      value: formatCurrency(summary.totalStockValue),
      icon: Wallet,
      tone: 'primary',
      hint: `${summary.totalAvailableUnits} unit dalam stok`,
    },
    { label: 'Produk (SKU)', value: String(summary.variantCount), icon: Boxes, tone: 'sky' },
    {
      label: 'Stok menipis',
      value: String(summary.lowStockCount),
      icon: AlertTriangle,
      tone: 'amber',
      accentClassName: summary.lowStockCount > 0 ? 'text-amber-600' : undefined,
    },
    {
      label: 'Stok habis',
      value: String(summary.outOfStockCount),
      icon: PackageX,
      tone: 'rose',
      accentClassName: summary.outOfStockCount > 0 ? 'text-destructive' : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      {summary.oversoldCount > 0 ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-center gap-2 rounded-lg border p-3 text-sm">
          <AlertTriangle className="size-4 shrink-0" />
          {summary.oversoldCount} item oversell (stok di bawah nol) — segera restok atau perbaiki
          jumlahnya.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <StatCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            tone={kpi.tone}
            hint={kpi.hint}
            accentClassName={kpi.accentClassName}
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Arus stok · 14 hari</CardTitle>
            <CardDescription>Unit yang masuk dan keluar tiap hari</CardDescription>
          </CardHeader>
          <CardContent>
            {hasFlow ? (
              <StockFlowChart data={dailyMovement} />
            ) : (
              <p className="text-muted-foreground py-12 text-center text-sm">
                Belum ada pergerakan stok dalam 14 hari terakhir.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Komposisi stok</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <CompositionBar
                segments={[
                  {
                    value: summary.totalAvailableUnits,
                    color: 'var(--chart-1)',
                    label: 'Tersedia',
                  },
                  {
                    value: summary.totalReservedUnits,
                    color: 'var(--muted-foreground)',
                    label: 'Dipesan',
                  },
                  { value: summary.totalDamagedUnits, color: 'var(--signed-down)', label: 'Rusak' },
                ]}
              />
              <ul className="space-y-1 text-xs">
                <CompositionLegendRow
                  color="var(--chart-1)"
                  label="Tersedia"
                  value={summary.totalAvailableUnits}
                />
                <CompositionLegendRow
                  color="var(--muted-foreground)"
                  label="Dipesan"
                  value={summary.totalReservedUnits}
                />
                <CompositionLegendRow
                  color="var(--signed-down)"
                  label="Rusak"
                  value={summary.totalDamagedUnits}
                />
              </ul>
            </div>

            {reorder ? (
              <Link
                href="/dashboard/inventory/reorder"
                className="hover:bg-muted/50 -mx-2 block rounded-lg px-2 py-2 transition-colors"
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <ShoppingCart className="text-primary size-4" />
                    {reorder.reorderCount > 0
                      ? `${reorder.reorderCount} perlu restok`
                      : 'Stok aman'}
                  </span>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                </div>
                <CompositionBar
                  segments={[
                    { value: reorder.urgentCount, color: 'var(--signed-down)', label: 'Mendesak' },
                    {
                      value: Math.max(0, reorder.reorderCount - reorder.urgentCount),
                      color: 'var(--highlight)',
                      label: 'Segera',
                    },
                  ]}
                />
                <p className="text-muted-foreground mt-1.5 text-xs">
                  {reorder.urgentCount > 0 ? `${reorder.urgentCount} mendesak · ` : ''}
                  {reorder.deadStockCount > 0
                    ? `${reorder.deadStockCount} stok mati (${formatCurrency(reorder.deadStockValue)})`
                    : 'Lihat saran restok'}
                </p>
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Perlu restok</CardTitle>
            <CardDescription>Stok yang paling sedikit di urutan atas</CardDescription>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Semua masih di atas batas stok menipis.
              </p>
            ) : (
              <div className="space-y-2">
                {lowStock.map((item) => (
                  <Link
                    key={item.variantId}
                    href={`/dashboard/products/${item.productId}`}
                    className="hover:bg-muted/50 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ImageThumb src={item.imageUrl} alt={item.variantName} />
                      <div className="min-w-0">
                        <div className="font-medium">{item.productName}</div>
                        <div className="text-muted-foreground text-xs">
                          {item.variantName} · {item.sku}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span
                        className={cn(
                          'num font-medium',
                          item.availableStock <= 0 ? 'text-destructive' : 'text-amber-600',
                        )}
                      >
                        {item.availableStock}
                      </span>
                      <div className="text-muted-foreground text-xs">
                        dari {item.lowStockThreshold}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Pergerakan stok terbaru</CardTitle>
              <Link
                href="/dashboard/inventory/activity"
                className="text-muted-foreground hover:text-foreground text-xs font-medium"
              >
                Lihat semua →
              </Link>
            </div>
            <CardDescription>Perubahan stok terbaru</CardDescription>
          </CardHeader>
          <CardContent>
            {recentMovements.length === 0 ? (
              <p className="text-muted-foreground text-sm">Belum ada pergerakan stok.</p>
            ) : (
              <div className="space-y-1">
                {recentMovements.map((movement) => (
                  <div
                    key={movement.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="flex items-center">
                      <NumberDelta value={movement.delta} showZero className="font-medium" />
                      <span className="text-muted-foreground ml-2">
                        {stockReasonLabel(movement.reason)}
                      </span>
                    </div>
                    <div className="text-muted-foreground text-right text-xs">
                      <div>{movement.variantSku}</div>
                      <div suppressHydrationWarning>{formatDateTime(movement.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CompositionLegendRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground flex items-center gap-1.5">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="num">{value.toLocaleString('id-ID')}</span>
    </li>
  );
}
