'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal, PackageSearch, QrCode, ScrollText, SlidersHorizontal } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
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
import { ImageThumb } from '@/components/image-thumb';
import { LowStockBadge } from '@/components/low-stock-badge';
import { QrCodeDialog } from '@/components/qr-code-dialog';
import { TablePagination } from '@/components/table-pagination';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePagination } from '@/hooks/use-pagination';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { formatDateTime } from '@/lib/formatters';
import {
  useBundleBuildableQuery,
  useMarkLabelsPrintedMutation,
} from '@/modules/catalog/hooks/use-products';

import { useStockOverviewQuery } from '../hooks/use-inventory';
import type { StockOverviewItem } from '../types';
import { AdjustStockDialog } from './adjust-stock-dialog';

export function InventoryOverview() {
  const [filters, setFilters] = useUrlFilters({ search: '', low: '' });
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [adjustTarget, setAdjustTarget] = useState<StockOverviewItem | null>(null);
  const [qrTarget, setQrTarget] = useState<StockOverviewItem | null>(null);
  const markPrinted = useMarkLabelsPrintedMutation();

  useEffect(() => {
    if (debouncedSearch !== filters.search) setFilters({ search: debouncedSearch });
  }, [debouncedSearch, filters.search, setFilters]);

  const lowStockOnly = filters.low === '1';
  const { data, isLoading, error } = useStockOverviewQuery(
    filters.search.trim() || undefined,
    lowStockOnly,
  );

  const { page, setPage, pageSize, setPageSize } = usePagination(10);

  // A new filter resets to the first page.
  useEffect(() => {
    setPage(1);
  }, [filters.search, lowStockOnly, setPage]);

  const items = data ?? [];
  const isEmpty = !isLoading && items.length === 0;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  // Overlay bundle awareness for the visible rows only (catalog hook — no service cross-import).
  const { data: buildableByVariant } = useBundleBuildableQuery(
    pageItems.map((item) => item.variantId),
  );

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
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Reserved</TableHead>
                <TableHead className="text-right">Damaged</TableHead>
                <TableHead className="text-right">Incoming</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((item) => {
                const buildable = buildableByVariant?.[item.variantId];
                const isBundle = buildable !== undefined;
                return (
                  <TableRow key={item.variantId}>
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
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground text-xs">
                              {item.variantName}
                            </span>
                            {isBundle ? (
                              <Badge className="shrink-0 border-transparent bg-violet-500/10 px-1.5 py-0 text-[10px] font-medium text-violet-600 dark:text-violet-400">
                                Bundle
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{item.sku}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {isBundle ? (
                        <span
                          className="font-medium tabular-nums"
                          title="Buildable from component stock"
                        >
                          {buildable}
                          <span className="text-muted-foreground ml-1 text-xs font-normal">
                            buildable
                          </span>
                        </span>
                      ) : (
                        <>
                          <span className="font-medium tabular-nums">{item.availableStock}</span>
                          {item.isLowStock ? (
                            <LowStockBadge threshold={item.lowStockThreshold} className="ml-2" />
                          ) : null}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {item.reservedStock > 0 ? (
                        <span title="Committed to paid, not-yet-shipped orders">
                          {item.reservedStock}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {item.damagedStock > 0 ? (
                        <span className="text-destructive" title="Written off from returns">
                          {item.damagedStock}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {item.incomingStock > 0 ? (
                        <span className="text-sky-600" title="On order from suppliers">
                          {item.incomingStock}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
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
                            <DropdownMenuItem onClick={() => setQrTarget(item)}>
                              <QrCode className="size-4" />
                              Show QR code
                            </DropdownMenuItem>
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
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {items.length > 0 ? (
        <TablePagination
          page={safePage}
          pageSize={pageSize}
          total={items.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}

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

      {qrTarget ? (
        <QrCodeDialog
          open={Boolean(qrTarget)}
          onOpenChange={(open) => {
            if (!open) setQrTarget(null);
          }}
          value={qrTarget.barcode?.trim() || qrTarget.sku}
          title={`${qrTarget.productName} · ${qrTarget.variantName}`}
          subtitle={qrTarget.sku}
          lastPrintedAt={qrTarget.labelPrintedAt}
          onPrint={() => markPrinted.mutate([qrTarget.variantId])}
        />
      ) : null}
    </div>
  );
}
