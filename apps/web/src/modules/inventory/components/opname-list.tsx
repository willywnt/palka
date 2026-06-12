'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardList, Plus, Search, SearchX } from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { StatusBadge } from '@/components/status-badge';
import { TablePagination } from '@/components/table-pagination';
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
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePagination } from '@/hooks/use-pagination';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { formatDateTime } from '@/lib/formatters';

import { useCreateOpnameMutation, useStockOpnamesQuery } from '../hooks/use-stock-opname';
import { OPNAME_STATUS_META } from '../utils/opname-display';
import type { StockOpnameListItem } from '../types';

const URL_DEFAULTS = { search: '', page: '1' };

/** Lightweight stand-in matching the page rhythm while the URL-synced filters hydrate. */
function OpnameListFallback() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-9 w-full sm:max-w-xs" />
        <Skeleton className="h-9 w-36" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** The URL-filter hook reads `useSearchParams`, so the list brings its own boundary. */
export function OpnameList() {
  return (
    <Suspense fallback={<OpnameListFallback />}>
      <OpnameListContent />
    </Suspense>
  );
}

function OpnameListContent() {
  const router = useRouter();
  const [filters, setFilters] = useUrlFilters(URL_DEFAULTS);
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300);
  const { pageSize, setPageSize } = usePagination(20);

  // Push the debounced search into the URL-synced filters (resetting paging).
  useEffect(() => {
    if (debouncedSearch !== filters.search) setFilters({ search: debouncedSearch, page: '1' });
  }, [debouncedSearch, filters.search, setFilters]);

  const page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
  const { data, isLoading, error, refetch } = useStockOpnamesQuery(page, pageSize, filters.search);
  const createOpname = useCreateOpnameMutation();
  const isFiltered = Boolean(filters.search);

  async function handleStart() {
    try {
      const opname = await createOpname.mutateAsync({});
      router.push(`/dashboard/inventory/opname/${opname.id}`);
    } catch (err) {
      toast.error('Gagal memulai opname', {
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Cari kode atau catatan…"
            aria-label="Cari opname"
            className="pl-9"
          />
        </div>
        <Button
          onClick={() => void handleStart()}
          disabled={createOpname.isPending}
          className="sm:shrink-0"
        >
          <Plus className="size-4" />
          {createOpname.isPending ? 'Memulai...' : 'Mulai opname'}
        </Button>
      </div>

      {error ? (
        <ErrorState
          title="Gagal memuat daftar opname"
          description={error instanceof Error ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      ) : isLoading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : data.items.length === 0 ? (
        isFiltered ? (
          <EmptyState
            icon={SearchX}
            title="Tidak ada opname yang cocok"
            description="Coba ubah kata kunci pencariannya."
          />
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="Belum ada opname"
            description="Mulai opname buat menghitung stok fisik dan menyamakannya dengan sistem."
          />
        )
      ) : (
        <div className="space-y-3">
          <OpnameTable items={data.items} />
          <TablePagination
            page={data.meta.page}
            pageSize={pageSize}
            total={data.meta.total}
            onPageChange={(nextPage) => setFilters({ page: String(nextPage) })}
            onPageSizeChange={(nextSize) => {
              setPageSize(nextSize);
              setFilters({ page: '1' });
            }}
          />
        </div>
      )}
    </div>
  );
}

function OpnameTable({ items }: { items: StockOpnameListItem[] }) {
  return (
    <>
      {/* Cards on phones, table on sm+. */}
      <ul className="space-y-3 sm:hidden">
        {items.map((item) => {
          const meta = OPNAME_STATUS_META[item.status];
          return (
            <li key={item.id} className="border-border/70 rounded-lg border p-3">
              <Link href={`/dashboard/inventory/opname/${item.id}`} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="num font-medium">{item.code}</span>
                  <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                </div>
                <span className="text-muted-foreground text-xs">
                  <span className="num">{item.itemCount}</span> item ·{' '}
                  {formatDateTime(item.startedAt)}
                </span>
                {item.note ? (
                  <span className="text-muted-foreground text-xs">{item.note}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kode</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Item</TableHead>
              <TableHead>Mulai</TableHead>
              <TableHead>Selesai</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const meta = OPNAME_STATUS_META[item.status];
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/inventory/opname/${item.id}`}
                      className="num font-medium hover:underline"
                    >
                      {item.code}
                    </Link>
                    {item.note ? (
                      <span className="text-muted-foreground block max-w-xs truncate text-xs">
                        {item.note}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                  </TableCell>
                  <TableCell className="num text-right">{item.itemCount}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDateTime(item.startedAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {item.completedAt ? formatDateTime(item.completedAt) : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
