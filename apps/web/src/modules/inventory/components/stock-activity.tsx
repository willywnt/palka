'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StockLedgerReason, StockLedgerSource } from '@prisma/client';
import { Download, RotateCcw, ScrollText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { DateRange } from 'react-day-picker';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DateRangePicker } from '@/components/date-range-picker';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { ImageThumb } from '@/components/image-thumb';
import { NumberDelta } from '@/components/number-delta';
import { TablePagination } from '@/components/table-pagination';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { apiRoutes } from '@/lib/api/routes';
import { formatDateTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';

import { useStockActivityQuery, type StockActivityFilters } from '../hooks/use-inventory';
import { stockReasonLabel } from '../utils/reason-display';

const REASONS = Object.values(StockLedgerReason);
const SOURCES = Object.values(StockLedgerSource);

/** Display-only labels for ledger sources — the values sent to the API stay verbatim. */
const SOURCE_LABELS: Record<StockLedgerSource, string> = {
  MANUAL: 'Manual',
  MARKETPLACE: 'Marketplace',
  POS: 'Kasir',
  PURCHASE: 'Pembelian',
  SYSTEM: 'Sistem',
};

const URL_DEFAULTS = {
  search: '',
  reason: '',
  source: '',
  direction: '',
  from: '',
  to: '',
  page: '1',
};

type ActivityUrlFilters = typeof URL_DEFAULTS;

function buildExportHref(filters: ActivityUrlFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.reason) params.set('reason', filters.reason);
  if (filters.source) params.set('source', filters.source);
  if (filters.direction) params.set('direction', filters.direction);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const query = params.toString();
  return `${apiRoutes.inventory}/activity/export${query ? `?${query}` : ''}`;
}

function toDateRange(from: string, to: string): DateRange | undefined {
  if (!from && !to) return undefined;
  return { from: from ? parseISO(from) : undefined, to: to ? parseISO(to) : undefined };
}

export function StockActivity() {
  const [filters, setFilters] = useUrlFilters(URL_DEFAULTS);
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  // Push the debounced search into the URL-synced filters (resetting paging).
  useEffect(() => {
    if (debouncedSearch !== filters.search) setFilters({ search: debouncedSearch, page: '1' });
  }, [debouncedSearch, filters.search, setFilters]);

  const page = Number(filters.page) || 1;
  const query: StockActivityFilters = {
    page,
    search: filters.search,
    reason: filters.reason as StockActivityFilters['reason'],
    source: filters.source as StockActivityFilters['source'],
    direction: filters.direction as StockActivityFilters['direction'],
    from: filters.from,
    to: filters.to,
  };

  const { data, isLoading, isFetching, error, refetch } = useStockActivityQuery(query);

  const items = data?.items ?? [];
  const total = data?.meta?.total ?? 0;
  // The activity API decides the page size; fall back defensively so the math never divides by 0.
  const metaPageSize = data?.meta?.pageSize ?? 0;
  const pageSize = metaPageSize > 0 ? metaPageSize : Math.max(items.length, 1);

  const isFiltered =
    Boolean(filters.search) ||
    Boolean(filters.reason) ||
    Boolean(filters.source) ||
    Boolean(filters.direction) ||
    Boolean(filters.from) ||
    Boolean(filters.to);

  const isEmpty = !isLoading && items.length === 0;

  function reset() {
    setSearchInput('');
    setFilters(URL_DEFAULTS);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Cari SKU atau varian..."
          className="h-9 w-full sm:max-w-xs"
        />

        <Select
          className="w-40"
          value={filters.reason}
          onChange={(event) => setFilters({ reason: event.target.value, page: '1' })}
          aria-label="Saring berdasarkan alasan"
        >
          <option value="">Semua alasan</option>
          {REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {stockReasonLabel(reason)}
            </option>
          ))}
        </Select>

        <Select
          className="w-36"
          value={filters.source}
          onChange={(event) => setFilters({ source: event.target.value, page: '1' })}
          aria-label="Saring berdasarkan sumber"
        >
          <option value="">Semua sumber</option>
          {SOURCES.map((source) => (
            <option key={source} value={source}>
              {SOURCE_LABELS[source]}
            </option>
          ))}
        </Select>

        <Select
          className="w-32"
          value={filters.direction}
          onChange={(event) => setFilters({ direction: event.target.value, page: '1' })}
          aria-label="Saring berdasarkan arah"
        >
          <option value="">Masuk &amp; keluar</option>
          <option value="in">Masuk (+)</option>
          <option value="out">Keluar (−)</option>
        </Select>

        <DateRangePicker
          value={toDateRange(filters.from, filters.to)}
          onChange={(range) =>
            setFilters({
              from: range?.from ? format(range.from, 'yyyy-MM-dd') : '',
              to: range?.to ? format(range.to, 'yyyy-MM-dd') : '',
              page: '1',
            })
          }
        />

        {isFiltered ? (
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="size-4" />
            Reset
          </Button>
        ) : null}

        <Button asChild variant="outline" size="sm" className="ml-auto">
          <a href={buildExportHref(filters)}>
            <Download className="size-4" />
            Export CSV
          </a>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState title="Gagal memuat aktivitas stok" onRetry={() => void refetch()} />
      ) : isEmpty ? (
        <EmptyState
          icon={ScrollText}
          title="Belum ada aktivitas stok"
          description={
            isFiltered
              ? 'Tidak ada pergerakan yang cocok dengan filter ini.'
              : 'Perubahan stok akan muncul di sini.'
          }
        />
      ) : (
        <>
          {/* Dim the previous page while the next one loads so paging feels alive. */}
          <div
            className={cn(
              'rounded-xl border transition-opacity',
              isFetching ? 'opacity-60' : 'opacity-100',
            )}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal &amp; waktu</TableHead>
                  <TableHead>Produk / varian</TableHead>
                  <TableHead>Alasan</TableHead>
                  <TableHead>Sumber</TableHead>
                  <TableHead className="text-right">Perubahan</TableHead>
                  <TableHead className="text-right">Saldo akhir</TableHead>
                  <TableHead>Catatan / referensi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((entry) => {
                  const noteText =
                    entry.note ?? (entry.referenceId ? `ref: ${entry.referenceId}` : '');
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                        <span suppressHydrationWarning>{formatDateTime(entry.createdAt)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <ImageThumb src={entry.imageUrl} alt={entry.variantName} />
                          <div className="min-w-0">
                            <Link
                              href={`/dashboard/products/${entry.productId}`}
                              className="font-medium hover:underline"
                            >
                              {entry.productName}
                            </Link>
                            <div className="text-muted-foreground text-xs">
                              {entry.variantName} · {entry.sku}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{stockReasonLabel(entry.reason)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{SOURCE_LABELS[entry.source]}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <NumberDelta value={entry.delta} showZero />
                      </TableCell>
                      <TableCell className="num text-right">{entry.balanceAfter}</TableCell>
                      <TableCell className="max-w-[14rem]">
                        {noteText ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-muted-foreground block truncate text-xs">
                                {noteText}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs break-words">
                              {noteText}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* The API fixes the page size, so the rows-per-page select only shows the current one. */}
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={(next) => setFilters({ page: String(next) })}
            onPageSizeChange={() => undefined}
            pageSizeOptions={[pageSize]}
          />
        </>
      )}
    </div>
  );
}
