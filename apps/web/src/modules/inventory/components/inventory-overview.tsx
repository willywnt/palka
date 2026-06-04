'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal, PackageSearch, ScrollText, SlidersHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { LowStockBadge } from '@/components/low-stock-badge';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/formatters';

import { useStockOverviewQuery } from '../hooks/use-inventory';
import type { StockOverviewItem } from '../types';
import { AdjustStockDialog } from './adjust-stock-dialog';

export function InventoryOverview() {
  const [filters, setFilters] = useUrlFilters({ search: '', low: '' });
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [adjustTarget, setAdjustTarget] = useState<StockOverviewItem | null>(null);

  useEffect(() => {
    if (debouncedSearch !== filters.search) setFilters({ search: debouncedSearch });
  }, [debouncedSearch, filters.search, setFilters]);

  const lowStockOnly = filters.low === '1';
  const { data, isLoading, error } = useStockOverviewQuery(
    filters.search.trim() || undefined,
    lowStockOnly,
  );

  const items = data ?? [];
  const isEmpty = !isLoading && items.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search SKU or variant..."
          className="sm:max-w-xs"
        />
        <div className="flex items-center gap-2">
          <Switch
            id="low-stock-only"
            checked={lowStockOnly}
            onCheckedChange={(checked) => setFilters({ low: checked ? '1' : '' })}
          />
          <Label htmlFor="low-stock-only" className="text-sm font-normal">
            Low stock only
          </Label>
        </div>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          Failed to load stock. {error instanceof Error ? error.message : 'Please try again.'}
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
            lowStockOnly
              ? 'No variants are below their low-stock level.'
              : filters.search
                ? 'No variants match your search.'
                : 'Add products to start tracking stock.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variant</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">In stock</TableHead>
                <TableHead className="text-right">Last change</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.variantId}>
                  <TableCell>
                    <Link
                      href={`/dashboard/products/${item.productId}`}
                      className="font-medium hover:underline"
                    >
                      {item.productName}
                    </Link>
                    <div className="text-muted-foreground text-xs">{item.variantName}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{item.sku}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <span className="font-medium tabular-nums">{item.availableStock}</span>
                    {item.isLowStock ? (
                      <LowStockBadge threshold={item.lowStockThreshold} className="ml-2" />
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right text-sm whitespace-nowrap tabular-nums">
                    {item.lastChange === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span>
                        {item.balanceBefore} → {item.balanceAfter}
                        <span
                          className={cn(
                            'ml-1 text-xs',
                            item.lastChange >= 0 ? 'text-emerald-600' : 'text-destructive',
                          )}
                        >
                          ({item.lastChange >= 0 ? '+' : ''}
                          {item.lastChange})
                        </span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {item.lastUpdatedAt ? (
                      <span suppressHydrationWarning>{formatDateTime(item.lastUpdatedAt)}</span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setAdjustTarget(item)}>
                        <SlidersHorizontal className="size-4" />
                        Adjust
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">More actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/dashboard/inventory/activity?search=${encodeURIComponent(item.sku)}`}
                            >
                              <ScrollText className="size-4" />
                              View activity
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {adjustTarget ? (
        <AdjustStockDialog
          variantId={adjustTarget.variantId}
          variantLabel={`${adjustTarget.variantName} · ${adjustTarget.sku}`}
          availableStock={adjustTarget.availableStock}
          open={Boolean(adjustTarget)}
          onOpenChange={(open) => {
            if (!open) setAdjustTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}
