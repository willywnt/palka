'use client';

import { useState } from 'react';
import Link from 'next/link';
import { StockLedgerReason, StockLedgerSource } from '@prisma/client';
import { ChevronLeft, ChevronRight, Download, RotateCcw, ScrollText } from 'lucide-react';

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
import { EmptyState } from '@/components/empty-state';
import { apiRoutes } from '@/lib/api/routes';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/formatters';

import { useStockActivityQuery, type StockActivityFilters } from '../hooks/use-inventory';
import { stockReasonLabel } from '../utils/reason-display';

const INITIAL_FILTERS: StockActivityFilters = {
  page: 1,
  search: '',
  reason: '',
  source: '',
  direction: '',
  from: '',
  to: '',
};

const REASONS = Object.values(StockLedgerReason);
const SOURCES = Object.values(StockLedgerSource);

function buildExportHref(filters: StockActivityFilters): string {
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

export function StockActivity({ initialSearch }: { initialSearch?: string } = {}) {
  const [filters, setFilters] = useState<StockActivityFilters>(() => ({
    ...INITIAL_FILTERS,
    search: initialSearch ?? '',
  }));

  // Any filter change resets to page 1; only paging keeps the current filters.
  function patch(next: Partial<StockActivityFilters>) {
    setFilters((current) => ({
      ...current,
      ...next,
      page: 'page' in next ? (next.page ?? 1) : 1,
    }));
  }

  const { data, isLoading, error } = useStockActivityQuery(filters);

  const items = data?.items ?? [];
  const total = data?.meta?.total ?? 0;
  const pageSize = data?.meta?.pageSize ?? 0;
  const totalPages = total > 0 && pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  const hasPrev = filters.page > 1;
  const hasNext = totalPages > 0 && filters.page < totalPages;

  const isFiltered =
    Boolean(filters.search) ||
    Boolean(filters.reason) ||
    Boolean(filters.source) ||
    Boolean(filters.direction) ||
    Boolean(filters.from) ||
    Boolean(filters.to);

  const isEmpty = !isLoading && items.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={filters.search}
          onChange={(event) => patch({ search: event.target.value })}
          placeholder="Search SKU or variant..."
          className="h-9 w-full sm:max-w-xs"
        />

        <Select
          className="w-40"
          value={filters.reason}
          onChange={(event) =>
            patch({ reason: event.target.value as StockActivityFilters['reason'] })
          }
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
          onChange={(event) =>
            patch({ source: event.target.value as StockActivityFilters['source'] })
          }
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
          onChange={(event) =>
            patch({ direction: event.target.value as StockActivityFilters['direction'] })
          }
          aria-label="Filter by direction"
        >
          <option value="">In &amp; out</option>
          <option value="in">In (+)</option>
          <option value="out">Out (−)</option>
        </Select>

        <Input
          type="date"
          value={filters.from}
          onChange={(event) => patch({ from: event.target.value })}
          className="h-9 w-auto"
          aria-label="From date"
        />
        <Input
          type="date"
          value={filters.to}
          onChange={(event) => patch({ to: event.target.value })}
          className="h-9 w-auto"
          aria-label="To date"
        />

        {isFiltered ? (
          <Button variant="ghost" size="sm" onClick={() => setFilters(INITIAL_FILTERS)}>
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
                  <TableHead>When</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Δ</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((entry) => (
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
                    <TableCell className="text-right tabular-nums">{entry.balanceAfter}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[16rem] truncate text-xs">
                      {entry.note ?? (entry.referenceId ? `ref: ${entry.referenceId}` : '—')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              {totalPages > 0 ? `Page ${filters.page} of ${totalPages}` : null} · {total} entries
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!hasPrev}
                onClick={() => patch({ page: filters.page - 1 })}
              >
                <ChevronLeft className="size-4" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasNext}
                onClick={() => patch({ page: filters.page + 1 })}
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
