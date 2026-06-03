'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarRange, PackageSearch, PackageX, ShoppingCart } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
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
import { EmptyState } from '@/components/empty-state';
import { StatCard } from '@/components/stat-card';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatters';

import { REORDER_DEFAULTS } from '../config';
import { useReorderReportQuery } from '../hooks/use-inventory';
import { reorderStatusDisplay } from '../utils/reorder-display';
import type { ReorderItem } from '../types';

const WINDOW_OPTIONS = [7, 30, 90] as const;

function formatVelocity(value: number): string {
  return value > 0 ? `${value.toFixed(1)}/day` : '—';
}

function formatDaysOfCover(value: number | null): string {
  if (value === null) return '∞';
  return `${Math.round(value)}d`;
}

export function ReorderReport() {
  const [windowDays, setWindowDays] = useState<number>(REORDER_DEFAULTS.windowDays);
  const [reorderOnly, setReorderOnly] = useState(false);

  const { data, isLoading, error } = useReorderReportQuery({
    windowDays,
    leadTimeDays: REORDER_DEFAULTS.leadTimeDays,
    targetCoverDays: REORDER_DEFAULTS.targetCoverDays,
  });

  const allItems = data?.items ?? [];
  const items = reorderOnly
    ? allItems.filter((item) => item.status === 'URGENT' || item.status === 'SOON')
    : allItems;
  const isEmpty = !isLoading && items.length === 0;

  return (
    <div className="space-y-6">
      {data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Needs reorder"
            value={data.summary.reorderCount}
            icon={ShoppingCart}
            accentClassName={data.summary.reorderCount > 0 ? 'text-amber-600' : undefined}
            hint={`${data.summary.urgentCount} urgent`}
          />
          <StatCard
            label="Dead stock"
            value={data.summary.deadStockCount}
            icon={PackageX}
            hint={`${formatCurrency(data.summary.deadStockValue)} tied up`}
          />
          <StatCard
            label="Sales window"
            value={`${data.summary.windowDays}d`}
            icon={CalendarRange}
            hint={`${data.summary.leadTimeDays}d lead · ${data.summary.targetCoverDays}d target cover`}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground mr-1 text-sm">Window</span>
          {WINDOW_OPTIONS.map((option) => (
            <Button
              key={option}
              variant={windowDays === option ? 'default' : 'outline'}
              size="sm"
              onClick={() => setWindowDays(option)}
            >
              {option}d
            </Button>
          ))}
        </div>
        <Button
          variant={reorderOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setReorderOnly((value) => !value)}
        >
          Needs reorder only
        </Button>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          Failed to load the reorder report.{' '}
          {error instanceof Error ? error.message : 'Please try again.'}
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={PackageSearch}
          title="Nothing to show"
          description={
            reorderOnly
              ? 'No variants need reordering right now.'
              : 'Add products and record some sales to see reorder suggestions.'
          }
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variant</TableHead>
                <TableHead className="text-right">Velocity</TableHead>
                <TableHead className="text-right">Cover</TableHead>
                <TableHead className="text-right">In stock</TableHead>
                <TableHead className="text-right">Reorder</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <ReorderRow key={item.variantId} item={item} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ReorderRow({ item }: { item: ReorderItem }) {
  const status = reorderStatusDisplay(item.status);

  return (
    <TableRow>
      <TableCell>
        <Link
          href={`/dashboard/products/${item.productId}`}
          className="font-medium hover:underline"
        >
          {item.productName}
        </Link>
        <div className="text-muted-foreground text-xs">
          {item.variantName} · {item.sku}
        </div>
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">
        <div className="text-muted-foreground">{formatVelocity(item.dailyVelocity)}</div>
        <div className="text-muted-foreground text-xs">
          {item.leadTimeDays}d lead
          {item.minOrderQty ? ` · MOQ ${item.minOrderQty}` : ''}
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatDaysOfCover(item.daysOfCover)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <span className={cn('font-medium', item.availableStock <= 0 && 'text-destructive')}>
          {item.availableStock}
        </span>
        {item.incomingStock > 0 ? (
          <div className="text-muted-foreground text-xs">+{item.incomingStock} incoming</div>
        ) : null}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {item.suggestedReorderQty > 0 ? (
          <span className="text-foreground inline-flex items-center gap-1 font-semibold">
            <ShoppingCart className="size-3.5" />
            {item.suggestedReorderQty}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Badge className={status.className}>{status.label}</Badge>
      </TableCell>
    </TableRow>
  );
}
