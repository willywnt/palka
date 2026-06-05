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
import { formatCurrency, formatDateTime } from '@/lib/formatters';

import { usePurchaseOrdersQuery } from '../hooks/use-purchase-orders';
import { PurchaseOrderStatusBadge } from './purchase-order-status-badge';

export function PurchasingDashboard() {
  const { data, isLoading, error } = usePurchaseOrdersQuery();
  const orders = data ?? [];
  const isEmpty = !isLoading && orders.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button asChild>
          <Link href="/dashboard/purchasing/new">
            <Plus className="size-4" />
            New purchase order
          </Link>
        </Button>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          Failed to load purchase orders.{' '}
          {error instanceof Error ? error.message : 'Please try again.'}
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
          icon={Truck}
          title="No purchase orders"
          description="Order stock from a supplier — it shows as incoming, then becomes available when you receive it."
          action={
            <Button asChild>
              <Link href="/dashboard/purchasing/new">
                <Plus className="size-4" />
                New purchase order
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Total cost</TableHead>
                <TableHead>Ordered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/purchasing/${order.id}`}
                      className="font-medium hover:underline"
                    >
                      {order.code}
                    </Link>
                    <div className="text-muted-foreground text-xs">
                      {order.supplierName ?? 'No supplier'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <PurchaseOrderStatusBadge status={order.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{order.itemCount}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
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
      )}
    </div>
  );
}
