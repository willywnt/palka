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
import { formatDateTime } from '@/lib/formatters';

import { useOrdersQuery } from '../hooks/use-orders';
import { OrderStatusBadge } from './order-status-badge';
import { PullOrdersDialog } from './pull-orders-dialog';

export function OrdersDashboard() {
  const { data, isLoading, error } = useOrdersQuery();
  const [pullOpen, setPullOpen] = useState(false);

  const orders = data ?? [];
  const isEmpty = !isLoading && orders.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setPullOpen(true)}>
          <DownloadCloud className="size-4" />
          Pull orders
        </Button>
      </div>

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
          description="Pull orders from your connected stores to bring them into stock."
          action={
            <Button onClick={() => setPullOpen(true)}>
              <DownloadCloud className="size-4" />
              Pull orders
            </Button>
          }
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
                <TableHead>Last pulled</TableHead>
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
      )}

      <PullOrdersDialog open={pullOpen} onOpenChange={setPullOpen} />
    </div>
  );
}
