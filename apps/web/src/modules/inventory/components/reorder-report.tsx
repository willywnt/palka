'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarRange, Info, PackageSearch, PackageX, ShoppingCart, Truck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { ImageThumb } from '@/components/image-thumb';
import { StatCard } from '@/components/stat-card';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatters';

import { REORDER_DEFAULTS } from '../config';
import { useReorderReportQuery } from '../hooks/use-inventory';
import { reorderStatusDisplay } from '../utils/reorder-display';
import type { ReorderItem } from '../types';

const WINDOW_OPTIONS = [7, 30, 90] as const;

/** A right-aligned column header with an info icon explaining the metric. */
function HeadWithHint({ label, hint }: { label: string; hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default items-center gap-1">
          {label}
          <Info className="text-muted-foreground size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
    </Tooltip>
  );
}

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
            tone="amber"
            accentClassName={data.summary.reorderCount > 0 ? 'text-amber-600' : undefined}
            hint={`${data.summary.urgentCount} urgent`}
          />
          <StatCard
            label="Dead stock"
            value={data.summary.deadStockCount}
            icon={PackageX}
            tone="rose"
            hint={`${formatCurrency(data.summary.deadStockValue)} tied up`}
          />
          <StatCard
            label="Sales window"
            value={`${data.summary.windowDays}d`}
            icon={CalendarRange}
            tone="violet"
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
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="needs-reorder-only"
              checked={reorderOnly}
              onCheckedChange={setReorderOnly}
            />
            <Label htmlFor="needs-reorder-only" className="text-sm font-normal">
              Needs reorder only
            </Label>
          </div>
          <Button size="sm" asChild>
            <Link href="/dashboard/purchasing/new">
              <Truck className="size-4" />
              Create PO
            </Link>
          </Button>
        </div>
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
                <TableHead className="text-right">
                  <HeadWithHint
                    label="Velocity"
                    hint="Average units sold per day over the selected sales window."
                  />
                </TableHead>
                <TableHead className="text-right">
                  <HeadWithHint
                    label="Cover"
                    hint="How many days your current stock will last at the current sales velocity."
                  />
                </TableHead>
                <TableHead className="text-right">In stock</TableHead>
                <TableHead className="text-right">
                  <HeadWithHint
                    label="Lead time"
                    hint="Days until a restock arrives after you place a reorder."
                  />
                </TableHead>
                <TableHead className="text-right">
                  <HeadWithHint
                    label="MOQ"
                    hint="Minimum order quantity: the smallest amount your supplier will accept per order."
                  />
                </TableHead>
                <TableHead className="text-right">
                  <HeadWithHint
                    label="Reorder"
                    hint="Suggested quantity to buy: enough to cover your lead time plus the target days of cover, and at least the supplier MOQ."
                  />
                </TableHead>
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
        <div className="flex items-center gap-3">
          <ImageThumb src={item.imageUrl} alt={item.variantName} />
          <div className="min-w-0">
            <Link
              href={`/dashboard/products/${item.productId}`}
              className="font-medium hover:underline"
            >
              {item.productName}
            </Link>
            <div className="text-muted-foreground text-xs">
              {item.variantName} · {item.sku}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground text-right text-sm tabular-nums">
        {formatVelocity(item.dailyVelocity)}
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
      <TableCell className="text-right tabular-nums">{item.leadTimeDays}d</TableCell>
      <TableCell className="text-right tabular-nums">
        {item.minOrderQty ?? <span className="text-muted-foreground">—</span>}
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
