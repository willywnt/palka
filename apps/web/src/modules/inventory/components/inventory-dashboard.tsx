'use client';

import Link from 'next/link';
import { AlertTriangle, Boxes, PackageX, Wallet, type LucideIcon } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDateTime } from '@/lib/formatters';

import { useInventoryDashboardQuery } from '../hooks/use-inventory';
import { stockReasonLabel } from '../utils/reason-display';

export function InventoryDashboard() {
  const { data, isLoading, error } = useInventoryDashboardQuery();

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

  const kpis: Array<{
    label: string;
    value: string;
    icon: LucideIcon;
    hint?: string;
    accent?: string;
  }> = [
    {
      label: 'Stock value',
      value: formatCurrency(summary.totalStockValue),
      icon: Wallet,
      hint: `${summary.totalAvailableUnits} units in stock`,
    },
    { label: 'Products (SKUs)', value: String(summary.variantCount), icon: Boxes },
    {
      label: 'Low stock',
      value: String(summary.lowStockCount),
      icon: AlertTriangle,
      accent: summary.lowStockCount > 0 ? 'text-amber-600' : undefined,
    },
    {
      label: 'Out of stock',
      value: String(summary.outOfStockCount),
      icon: PackageX,
      accent: summary.outOfStockCount > 0 ? 'text-destructive' : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      {summary.oversoldCount > 0 ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-center gap-2 rounded-lg border p-3 text-sm">
          <AlertTriangle className="size-4 shrink-0" />
          {summary.oversoldCount} variant(s) are oversold (negative available stock) — restock or
          reconcile soon.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>{kpi.label}</CardDescription>
                  <Icon className="text-muted-foreground size-4" />
                </div>
                <CardTitle className={cn('text-2xl', kpi.accent)}>{kpi.value}</CardTitle>
              </CardHeader>
              {kpi.hint ? (
                <CardContent className="pt-0">
                  <p className="text-muted-foreground text-xs">{kpi.hint}</p>
                </CardContent>
              ) : null}
            </Card>
          );
        })}
      </div>

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
                    className="hover:bg-muted/50 flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">{item.productName}</div>
                      <div className="text-muted-foreground text-xs">
                        {item.variantName} · {item.sku}
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
            <CardTitle className="text-base">Recent stock movements</CardTitle>
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
