'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  MoreHorizontal,
  PackageSearch,
  QrCode,
  ScrollText,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';

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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { ImageThumb } from '@/components/image-thumb';
import { LowStockBadge } from '@/components/low-stock-badge';
import { QrCodeDialog } from '@/components/qr-code-dialog';
import { TablePagination } from '@/components/table-pagination';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePagination } from '@/hooks/use-pagination';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { formatDateTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { formatVariantLabel } from '@/lib/variant-label';
import { useMarkLabelsPrintedMutation } from '@/modules/catalog/hooks/use-products';

import { useStockOverviewQuery } from '../hooks/use-inventory';
import type { StockOverviewItem } from '../types';
import { AdjustStockDialog } from './adjust-stock-dialog';
import { WriteOffDamagedDialog } from './write-off-damaged-dialog';

const STOCK_HINTS = {
  reserved: 'Dipesan untuk pesanan yang sudah dibayar tapi belum dikirim',
  damaged: 'Dari retur',
  incoming: 'Lagi dipesan ke supplier',
} as const;

/** Tooltip-wrapped stock figure — keyboard-focusable so the hint works without a mouse. */
function StockHint({
  hint,
  className,
  children,
}: {
  hint: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            'focus-visible:ring-ring/50 cursor-default rounded-sm focus-visible:ring-[3px] focus-visible:outline-none',
            className,
          )}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
    </Tooltip>
  );
}

/** The shared ⋯ menu — same actions on the desktop row and the mobile card. */
function RowActionsMenu({
  item,
  onShowQr,
  onDispose,
}: {
  item: StockOverviewItem;
  onShowQr: (item: StockOverviewItem) => void;
  onDispose: (item: StockOverviewItem) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Aksi lainnya</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onShowQr(item)}>
          <QrCode className="size-4" />
          Tampilkan QR
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/inventory/activity?search=${encodeURIComponent(item.sku)}`}>
            <ScrollText className="size-4" />
            Lihat aktivitas
          </Link>
        </DropdownMenuItem>
        {item.damagedStock > 0 ? (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onDispose(item)}
          >
            <Trash2 className="size-4" />
            Hapus stok rusak
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Compact label+value chip for the mobile card's Dipesan / Rusak / Akan datang row. */
function StockChip({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div className="bg-secondary flex items-center gap-1.5 rounded-md px-2 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('num font-medium', value > 0 ? valueClassName : 'text-muted-foreground')}>
        {value}
      </dd>
    </div>
  );
}

export function InventoryOverview() {
  const [filters, setFilters] = useUrlFilters({ search: '', low: '' });
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [adjustTarget, setAdjustTarget] = useState<StockOverviewItem | null>(null);
  const [disposeTarget, setDisposeTarget] = useState<StockOverviewItem | null>(null);
  const [qrTarget, setQrTarget] = useState<StockOverviewItem | null>(null);
  const markPrinted = useMarkLabelsPrintedMutation();

  useEffect(() => {
    if (debouncedSearch !== filters.search) setFilters({ search: debouncedSearch });
  }, [debouncedSearch, filters.search, setFilters]);

  const lowStockOnly = filters.low === '1';
  const { data, isLoading, error, refetch } = useStockOverviewQuery(
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Cari SKU atau varian..."
          className="sm:max-w-xs"
        />
        <div className="flex items-center gap-2">
          <Switch
            id="low-stock-only"
            checked={lowStockOnly}
            onCheckedChange={(checked) => setFilters({ low: checked ? '1' : '' })}
          />
          <Label htmlFor="low-stock-only" className="text-sm font-normal">
            Hanya stok menipis
          </Label>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState title="Gagal memuat stok" onRetry={() => void refetch()} />
      ) : isEmpty ? (
        <EmptyState
          icon={PackageSearch}
          title="Tidak ada yang ditampilkan"
          description={
            lowStockOnly
              ? 'Tidak ada varian yang di bawah batas stok menipis.'
              : filters.search
                ? 'Tidak ada varian yang cocok dengan pencarian kamu.'
                : 'Tambah produk untuk mulai melacak stok.'
          }
          action={
            !lowStockOnly && !filters.search ? (
              <Button asChild>
                <Link href="/dashboard/products">Tambah produk</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Mobile: stacked cards — same data + actions as the table. */}
          <div className="space-y-3 sm:hidden">
            {pageItems.map((item) => (
              <article key={item.variantId} className="space-y-3 rounded-xl border p-4">
                <div className="flex items-start gap-3">
                  <ImageThumb src={item.imageUrl} alt={item.variantName} />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/products/${item.productId}`}
                      className="block truncate font-medium hover:underline"
                    >
                      {item.productName}
                    </Link>
                    <div className="text-muted-foreground truncate text-xs">
                      {formatVariantLabel({
                        variantGroup: item.variantGroup,
                        name: item.variantName,
                      })}{' '}
                      · {item.sku}
                    </div>
                  </div>
                </div>

                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="num text-2xl font-semibold">{item.availableStock}</span>
                    <span className="text-muted-foreground text-xs">Tersedia</span>
                  </div>
                  {item.isLowStock ? <LowStockBadge threshold={item.lowStockThreshold} /> : null}
                </div>

                <dl className="flex flex-wrap items-center gap-1.5 text-xs">
                  <StockChip label="Dipesan" value={item.reservedStock} />
                  <StockChip
                    label="Rusak"
                    value={item.damagedStock}
                    valueClassName="text-status-warn"
                  />
                  <StockChip
                    label="Akan datang"
                    value={item.incomingStock}
                    valueClassName="text-status-info"
                  />
                </dl>

                {item.lastUpdatedAt ? (
                  <p className="text-muted-foreground text-xs">
                    Diperbarui{' '}
                    <span suppressHydrationWarning>{formatDateTime(item.lastUpdatedAt)}</span>
                  </p>
                ) : null}

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setAdjustTarget(item)}
                  >
                    <SlidersHorizontal className="size-4" />
                    Sesuaikan
                  </Button>
                  <RowActionsMenu item={item} onShowQr={setQrTarget} onDispose={setDisposeTarget} />
                </div>
              </article>
            ))}
          </div>

          {/* Desktop table — the Table primitive scrolls itself. */}
          <div className="hidden rounded-xl border sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Varian</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Tersedia</TableHead>
                  <TableHead className="text-right">Dipesan</TableHead>
                  <TableHead className="text-right">Rusak</TableHead>
                  <TableHead className="text-right">Akan datang</TableHead>
                  <TableHead>Diperbarui</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((item) => (
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
                          <div className="text-muted-foreground text-xs">
                            {formatVariantLabel({
                              variantGroup: item.variantGroup,
                              name: item.variantName,
                            })}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{item.sku}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <span className="num font-medium">{item.availableStock}</span>
                      {item.isLowStock ? (
                        <LowStockBadge threshold={item.lowStockThreshold} className="ml-2" />
                      ) : null}
                    </TableCell>
                    <TableCell className="num text-right whitespace-nowrap">
                      {item.reservedStock > 0 ? (
                        <StockHint hint={STOCK_HINTS.reserved}>{item.reservedStock}</StockHint>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="num text-right whitespace-nowrap">
                      {item.damagedStock > 0 ? (
                        <StockHint hint={STOCK_HINTS.damaged} className="text-status-warn">
                          {item.damagedStock}
                        </StockHint>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="num text-right whitespace-nowrap">
                      {item.incomingStock > 0 ? (
                        <StockHint hint={STOCK_HINTS.incoming} className="text-status-info">
                          {item.incomingStock}
                        </StockHint>
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
                          Sesuaikan
                        </Button>
                        <RowActionsMenu
                          item={item}
                          onShowQr={setQrTarget}
                          onDispose={setDisposeTarget}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
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

      {disposeTarget ? (
        <WriteOffDamagedDialog
          variantId={disposeTarget.variantId}
          variantLabel={`${disposeTarget.variantName} · ${disposeTarget.sku}`}
          damagedStock={disposeTarget.damagedStock}
          open={Boolean(disposeTarget)}
          onOpenChange={(open) => {
            if (!open) setDisposeTarget(null);
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
          name={formatVariantLabel({
            variantGroup: qrTarget.variantGroup,
            name: qrTarget.variantName,
          })}
          sku={qrTarget.sku}
          lastPrintedAt={qrTarget.labelPrintedAt}
          onPrint={() => markPrinted.mutate([qrTarget.variantId])}
        />
      ) : null}
    </div>
  );
}
