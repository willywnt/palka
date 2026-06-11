'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardList, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { StatusBadge } from '@/components/status-badge';
import { TablePagination } from '@/components/table-pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePagination } from '@/hooks/use-pagination';
import { formatDateTime } from '@/lib/formatters';

import { useCreateOpnameMutation, useStockOpnamesQuery } from '../hooks/use-stock-opname';
import { OPNAME_STATUS_META } from '../utils/opname-display';
import type { StockOpnameListItem } from '../types';

export function OpnameList() {
  const router = useRouter();
  const { page, setPage, pageSize, setPageSize } = usePagination(20);
  const { data, isLoading, error, refetch } = useStockOpnamesQuery(page, pageSize);
  const createOpname = useCreateOpnameMutation();

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
      <div className="flex justify-end">
        <Button onClick={() => void handleStart()} disabled={createOpname.isPending}>
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
        <Card>
          <CardContent className="py-2">
            <EmptyState
              icon={ClipboardList}
              title="Belum ada opname"
              description="Mulai opname buat menghitung stok fisik dan menyamakannya dengan sistem."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <OpnameTable items={data.items} />
            <div className="mt-4">
              <TablePagination
                page={data.meta.page}
                pageSize={pageSize}
                total={data.meta.total}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          </CardContent>
        </Card>
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

      <div className="hidden overflow-x-auto sm:block">
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
                <TableRow key={item.id} className="cursor-pointer">
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
