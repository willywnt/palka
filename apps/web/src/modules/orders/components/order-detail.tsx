'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

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
import { formatCurrency, formatDateTime } from '@/lib/formatters';

import { useOrderQuery } from '../hooks/use-orders';
import { OrderStatusBadge } from './order-status-badge';

export function OrderDetail({ orderId }: { orderId: string }) {
  const { data, isLoading, error } = useOrderQuery(orderId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/dashboard/orders">
            <ArrowLeft className="size-4" />
            Back to orders
          </Link>
        </Button>
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          {error instanceof Error ? error.message : 'Order not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard/orders">
          <ArrowLeft className="size-4" />
          Back to orders
        </Link>
      </Button>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{data.externalOrderId}</h2>
          <OrderStatusBadge status={data.status} />
        </div>
        <div className="text-muted-foreground grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            Store: <span className="text-foreground">{data.shopName}</span>
          </div>
          <div>
            Buyer: <span className="text-foreground">{data.buyerName ?? '—'}</span>
          </div>
          <div>
            Placed:{' '}
            <span className="text-foreground" suppressHydrationWarning>
              {formatDateTime(data.placedAt)}
            </span>
          </div>
          <div>
            Total:{' '}
            <span className="text-foreground">
              {data.totalAmount ? formatCurrency(data.totalAmount) : '—'}
            </span>
          </div>
          <div>
            Resi: <span className="text-foreground">{data.noResi ?? '—'}</span>
          </div>
        </div>
      </div>

      {data.inventoryApplied ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">
          Stock has been decremented from your source of truth for this order.
        </div>
      ) : data.status === 'PAID' && data.unresolvedCount > 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700">
          {data.unresolvedCount} item(s) are not mapped to an internal variant, so stock was not
          decremented. Map the listing, then re-pull orders.
        </div>
      ) : data.status === 'PAID' ? (
        <div className="text-muted-foreground rounded-lg border p-3 text-sm">
          Stock not yet applied for this order.
        </div>
      ) : null}

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit price</TableHead>
              <TableHead>Maps to</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium">{item.externalName}</div>
                  {item.externalSku ? (
                    <div className="text-muted-foreground text-xs">{item.externalSku}</div>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.unitPrice ? formatCurrency(item.unitPrice) : '—'}
                </TableCell>
                <TableCell>
                  {item.variant ? (
                    <div>
                      <Badge variant="secondary">{item.variant.sku}</Badge>
                      <div className="text-muted-foreground text-xs">
                        {item.variant.productName} / {item.variant.name}
                      </div>
                    </div>
                  ) : (
                    <Badge variant="outline" className="border-amber-500 text-amber-600">
                      Unmapped
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
