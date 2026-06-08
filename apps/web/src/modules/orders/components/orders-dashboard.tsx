'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DownloadCloud, ShoppingCart } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { TablePagination } from '@/components/table-pagination';
import { usePagination } from '@/hooks/use-pagination';
import { formatDateTime } from '@/lib/formatters';

import { useOrdersQuery } from '../hooks/use-orders';
import { OrderStatusBadge } from './order-status-badge';
import { PullOrdersDialog } from './pull-orders-dialog';

export function OrdersDashboard() {
  const { page, setPage, pageSize, setPageSize } = usePagination();
  const { data, isLoading, error } = useOrdersQuery(page, pageSize);
  const [pullOpen, setPullOpen] = useState(false);

  const orders = data?.items ?? [];
  const total = data?.meta.total ?? 0;
  const isEmpty = !isLoading && total === 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setPullOpen(true)}>
          <DownloadCloud className="size-4" />
          Tarik pesanan
        </Button>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          Gagal memuat pesanan. {error instanceof Error ? error.message : 'Silakan coba lagi.'}
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
          icon={ShoppingCart}
          title="Belum ada pesanan — tarik dari toko kamu dulu"
          description="Tarik pesanan dari toko yang terhubung biar stoknya ikut kekelola di sini."
          action={
            <Button onClick={() => setPullOpen(true)}>
              <DownloadCloud className="size-4" />
              Tarik pesanan
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pesanan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pembeli</TableHead>
                  <TableHead className="text-right">Item</TableHead>
                  <TableHead>Stok</TableHead>
                  <TableHead>Dibuat</TableHead>
                  <TableHead>Terakhir ditarik</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/orders/${order.id}`}
                        className="font-medium hover:underline"
                      >
                        {order.externalOrderId}
                      </Link>
                      <div className="text-muted-foreground text-xs">{order.shopName}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <OrderStatusBadge status={order.status} />
                        {order.fulfilledAt ? (
                          <Badge className="bg-sky-600 text-white hover:bg-sky-600">
                            Fulfillment
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{order.buyerName ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <span className="num">{order.itemCount}</span>
                      {order.unresolvedCount > 0 ? (
                        <Badge variant="outline" className="ml-2 border-amber-500 text-amber-600">
                          {order.unresolvedCount} belum dikaitkan
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {order.inventoryApplied ? (
                        <Badge variant="secondary">Sudah sinkron</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {order.status === 'PAID' ? 'belum sinkron' : '—'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap" suppressHydrationWarning>
                      {formatDateTime(order.placedAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                      {order.lastPulledAt ? (
                        <span suppressHydrationWarning>{formatDateTime(order.lastPulledAt)}</span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

      <PullOrdersDialog open={pullOpen} onOpenChange={setPullOpen} />
    </div>
  );
}
