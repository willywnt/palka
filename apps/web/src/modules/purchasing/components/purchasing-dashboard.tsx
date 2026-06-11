'use client';

import Link from 'next/link';
import { Plus, Truck } from 'lucide-react';

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
import { ErrorState } from '@/components/error-state';
import { formatCurrency, formatDateTime } from '@/lib/formatters';

import { usePurchaseOrdersQuery } from '../hooks/use-purchase-orders';
import { PurchaseOrderStatusBadge } from './purchase-order-status-badge';

export function PurchasingDashboard() {
  const { data, isLoading, error, refetch } = usePurchaseOrdersQuery();
  const orders = data ?? [];
  const isEmpty = !isLoading && orders.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button asChild>
          <Link href="/dashboard/purchasing/new">
            <Plus className="size-4" />
            Pembelian baru
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="overflow-hidden rounded-xl border">
          <Skeleton className="h-10 w-full rounded-none" />
          <div className="divide-y">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4 px-4 py-3.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="ml-auto h-4 w-8" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <ErrorState title="Gagal memuat daftar pembelian" onRetry={() => void refetch()} />
      ) : isEmpty ? (
        <EmptyState
          icon={Truck}
          title="Belum ada pembelian"
          description="Pesan stok dari pemasok — stok muncul sebagai akan datang, lalu jadi tersedia saat kamu terima."
          action={
            <Button asChild>
              <Link href="/dashboard/purchasing/new">
                <Plus className="size-4" />
                Pembelian baru
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop table — the same rows render as cards below sm. */}
          <div className="hidden overflow-x-auto rounded-xl border sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pembelian</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Item</TableHead>
                  <TableHead className="text-right">Total modal</TableHead>
                  <TableHead>Dipesan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/purchasing/${order.id}`}
                        className="num font-medium hover:underline"
                      >
                        {order.code}
                      </Link>
                      <div className="text-muted-foreground text-xs">
                        {order.supplierName ?? 'Tanpa pemasok'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <PurchaseOrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="num text-right">{order.itemCount}</TableCell>
                    <TableCell className="num text-right font-medium">
                      {formatCurrency(order.totalCost)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                      <span suppressHydrationWarning>{formatDateTime(order.orderedAt)}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card list — same data as the table. */}
          <div className="space-y-3 sm:hidden">
            {orders.map((order) => (
              <article key={order.id} className="bg-card space-y-3 rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/purchasing/${order.id}`}
                      className="num font-medium break-words hover:underline"
                    >
                      {order.code}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      {order.supplierName ?? 'Tanpa pemasok'}
                    </p>
                  </div>
                  <PurchaseOrderStatusBadge status={order.status} />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                  <span className="text-muted-foreground">
                    Item <span className="num text-foreground font-medium">{order.itemCount}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Total modal{' '}
                    <span className="num text-foreground font-medium">
                      {formatCurrency(order.totalCost)}
                    </span>
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">
                  Dipesan <span suppressHydrationWarning>{formatDateTime(order.orderedAt)}</span>
                </p>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
