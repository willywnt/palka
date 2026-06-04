'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StockLedgerReason, StockLedgerSource } from '@prisma/client';
import { ChevronLeft, ChevronRight, Download, RotateCcw, ScrollText } from 'lucide-react';
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
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { apiRoutes } from '@/lib/api/routes';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/formatters';

import { useStockActivityQuery, type StockActivityFilters } from '../hooks/use-inventory';
import { stockReasonLabel } from '../utils/reason-display';

const REASONS = Object.values(StockLedgerReason);
const SOURCES = Object.values(StockLedgerSource);

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

  const { data, isLoading, error } = useStockActivityQuery(query);

  const items = data?.items ?? [];
  const total = data?.meta?.total ?? 0;
  const pageSize = data?.meta?.pageSize ?? 0;
  const totalPages = total > 0 && pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  const hasPrev = page > 1;
  const hasNext = totalPages > 0 && page < totalPages;

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
          placeholder="Search SKU or variant..."
          className="h-9 w-full sm:max-w-xs"
        />

        <Select
          className="w-40"
          value={filters.reason}
          onChange={(event) => setFilters({ reason: event.target.value, page: '1' })}
          aria-label="Filter by reason"
        >
          <option value="">All reasons</option>
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
          aria-label="Filter by source"
        >
          <option value="">All sources</option>
          {SOURCES.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </Select>

        <Select
          className="w-32"
          value={filters.direction}
          onChange={(event) => setFilters({ direction: event.target.value, page: '1' })}
          aria-label="Filter by direction"
        >
          <option value="">In &amp; out</option>
          <option value="in">In (+)</option>
          <option value="out">Out (−)</option>
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

      {error ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          Failed to load activity. {error instanceof Error ? error.message : 'Please try again.'}
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={ScrollText}
          title="No stock activity"
          description={
            isFiltered ? 'No movements match these filters.' : 'Stock changes will show up here.'
          }
        />
      ) : (
        <>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date &amp; time</TableHead>
                  <TableHead>Product / variant</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">Balance after</TableHead>
                  <TableHead>Note / reference</TableHead>
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
                        <Link
                          href={`/dashboard/products/${entry.productId}`}
                          className="font-medium hover:underline"
                        >
                          {entry.productName}
                        </Link>
                        <div className="text-muted-foreground text-xs">
                          {entry.variantName} · {entry.sku}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{stockReasonLabel(entry.reason)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{entry.source}</Badge>
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-medium tabular-nums',
                          entry.delta >= 0 ? 'text-emerald-600' : 'text-destructive',
                        )}
                      >
                        {entry.delta >= 0 ? '+' : ''}
                        {entry.delta}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {entry.balanceAfter}
                      </TableCell>
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

          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              {totalPages > 0 ? `Page ${page} of ${totalPages}` : null} · {total} entries
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!hasPrev}
                onClick={() => setFilters({ page: String(page - 1) })}
              >
                <ChevronLeft className="size-4" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasNext}
                onClick={() => setFilters({ page: String(page + 1) })}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
