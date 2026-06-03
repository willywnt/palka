'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PackageSearch, ScrollText, SlidersHorizontal } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

import { useStockOverviewQuery } from '../hooks/use-inventory';
import type { StockOverviewItem } from '../types';
import { AdjustStockDialog } from './adjust-stock-dialog';

export function InventoryOverview() {
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<StockOverviewItem | null>(null);

  const { data, isLoading, error } = useStockOverviewQuery(
    search.trim() || undefined,
    lowStockOnly,
  );

  const items = data ?? [];
  const isEmpty = !isLoading && items.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search SKU or variant..."
          className="sm:max-w-xs"
        />
        <Button
          variant={lowStockOnly ? 'default' : 'outline'}
          onClick={() => setLowStockOnly((value) => !value)}
        >
          Low stock only
        </Button>
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
              ? 'No variants are below their low-stock threshold.'
              : search
                ? 'No variants match your search.'
                : 'Add products to start tracking stock.'
          }
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variant</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">In stock</TableHead>
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
                  <TableCell className="text-right">
                    <span className="font-medium tabular-nums">{item.availableStock}</span>
                    {item.isLowStock ? (
                      <Badge variant="destructive" className="ml-2">
                        Low
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          href={`/dashboard/inventory/activity?search=${encodeURIComponent(item.sku)}`}
                          title="View stock activity"
                        >
                          <ScrollText className="size-4" />
                          Activity
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setAdjustTarget(item)}>
                        <SlidersHorizontal className="size-4" />
                        Adjust
                      </Button>
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
