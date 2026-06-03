'use client';

import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
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
import { formatDateTime } from '@/lib/formatters';

import { useOrdersQuery } from '../hooks/use-orders';
import { OrderStatusBadge } from './order-status-badge';

export function OrdersDashboard() {
  const { data, isLoading, error } = useOrdersQuery();

  const orders = data ?? [];
  const isEmpty = !isLoading && orders.length === 0;

  return (
    <div className="space-y-6">
      {error ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          Failed to load orders. {error instanceof Error ? error.message : 'Please try again.'}
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
          title="No orders yet"
          description={'Open a connected store and use “Pull orders” to bring orders into stock.'}
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Placed</TableHead>
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
                    <OrderStatusBadge status={order.status} />
                  </TableCell>
                  <TableCell className="text-sm">{order.buyerName ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <span className="tabular-nums">{order.itemCount}</span>
                    {order.unresolvedCount > 0 ? (
                      <Badge variant="outline" className="ml-2 border-amber-500 text-amber-600">
                        {order.unresolvedCount} unmapped
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {order.inventoryApplied ? (
                      <Badge variant="secondary">Applied</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        {order.status === 'PAID' ? 'not applied' : '—'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell suppressHydrationWarning>{formatDateTime(order.placedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
