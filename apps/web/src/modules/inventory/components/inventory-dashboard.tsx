'use client';

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
import { ImageThumb } from '@/components/image-thumb';
import { StatCard, type StatTone } from '@/components/stat-card';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDateTime } from '@/lib/formatters';

import { REORDER_DEFAULTS } from '../config';
import { useInventoryDashboardQuery, useReorderReportQuery } from '../hooks/use-inventory';
import { stockReasonLabel } from '../utils/reason-display';

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
        {error instanceof Error ? error.message : 'Failed to load the dashboard.'}
      </div>
    );
  }

  const { summary, lowStock, recentMovements } = data;
  const reorder = reorderQuery.data?.summary;

  const kpis: Array<{
    label: string;
    value: string;
    icon: LucideIcon;
    tone: StatTone;
    hint?: string;
    accentClassName?: string;
  }> = [
    {
      label: 'Stock value',
      value: formatCurrency(summary.totalStockValue),
      icon: Wallet,
      tone: 'primary',
      hint:
        summary.totalReservedUnits > 0 || summary.totalDamagedUnits > 0
          ? [
              `${summary.totalAvailableUnits} available`,
              summary.totalReservedUnits > 0 ? `${summary.totalReservedUnits} reserved` : null,
              summary.totalDamagedUnits > 0 ? `${summary.totalDamagedUnits} damaged` : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : `${summary.totalAvailableUnits} units in stock`,
    },
    { label: 'Products (SKUs)', value: String(summary.variantCount), icon: Boxes, tone: 'sky' },
    {
      label: 'Low stock',
      value: String(summary.lowStockCount),
      icon: AlertTriangle,
      tone: 'amber',
      accentClassName: summary.lowStockCount > 0 ? 'text-amber-600' : undefined,
    },
    {
      label: 'Out of stock',
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
          {summary.oversoldCount} item(s) are oversold (stock dropped below zero) — restock or fix
          the count soon.
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

      {reorder ? (
        <Link
          href="/dashboard/inventory/reorder"
          className="hover:bg-muted/50 flex items-center justify-between rounded-xl border p-3 text-sm transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
              <ShoppingCart className="size-4" />
            </span>
            <div>
              <div className="font-medium">
                {reorder.reorderCount > 0
                  ? `${reorder.reorderCount} variant(s) need reordering`
                  : 'No reorders needed right now'}
              </div>
              <div className="text-muted-foreground text-xs">
                {reorder.urgentCount > 0 ? `${reorder.urgentCount} urgent · ` : ''}
                {reorder.deadStockCount > 0
                  ? `${reorder.deadStockCount} dead stock (${formatCurrency(reorder.deadStockValue)})`
                  : 'View reorder suggestions'}
              </div>
            </div>
          </div>
          <ChevronRight className="text-muted-foreground size-4 shrink-0" />
        </Link>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Needs restock</CardTitle>
            <CardDescription>Lowest available first</CardDescription>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Everything is above its low-stock threshold.
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
                          'font-medium tabular-nums',
                          item.availableStock <= 0 ? 'text-destructive' : 'text-amber-600',
                        )}
                      >
                        {item.availableStock}
                      </span>
                      <div className="text-muted-foreground text-xs">
                        of {item.lowStockThreshold}
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
              <CardTitle className="text-base">Recent stock movements</CardTitle>
              <Link
                href="/dashboard/inventory/activity"
                className="text-muted-foreground hover:text-foreground text-xs font-medium"
              >
                View all →
              </Link>
            </div>
            <CardDescription>Latest ledger entries</CardDescription>
          </CardHeader>
          <CardContent>
            {recentMovements.length === 0 ? (
              <p className="text-muted-foreground text-sm">No stock movements yet.</p>
            ) : (
              <div className="space-y-1">
                {recentMovements.map((movement) => (
                  <div
                    key={movement.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div>
                      <span
                        className={cn(
                          'font-medium tabular-nums',
                          movement.delta >= 0 ? 'text-emerald-600' : 'text-destructive',
                        )}
                      >
                        {movement.delta >= 0 ? '+' : ''}
                        {movement.delta}
                      </span>
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
