'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, PackageCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NumberInput } from '@/components/ui/number-input';
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

import {
  useCancelPurchaseOrderMutation,
  usePurchaseOrderQuery,
  useReceivePurchaseOrderMutation,
} from '../hooks/use-purchase-orders';
import { PurchaseOrderStatusBadge } from './purchase-order-status-badge';

export function PurchaseOrderDetail({ purchaseOrderId }: { purchaseOrderId: string }) {
  const { data, isLoading, error } = usePurchaseOrderQuery(purchaseOrderId);
  const receiveMutation = useReceivePurchaseOrderMutation(purchaseOrderId);
  const cancelMutation = useCancelPurchaseOrderMutation(purchaseOrderId);
  // itemId → qty to receive this round (defaults to each line's outstanding).
  const [receiveQty, setReceiveQty] = useState<Record<string, number>>({});

  const canReceive = data?.status === 'ORDERED' || data?.status === 'PARTIALLY_RECEIVED';
  const busy = receiveMutation.isPending || cancelMutation.isPending;

  async function handleReceive() {
    if (!data) return;
    const lines = data.items
      .map((item) => ({
        purchaseOrderItemId: item.id,
        quantity: Math.min(receiveQty[item.id] ?? item.outstanding, item.outstanding),
      }))
      .filter((line) => line.quantity > 0);
    if (lines.length === 0) {
      toast.info('Nothing to receive.');
      return;
    }
    try {
      await receiveMutation.mutateAsync({ lines });
      toast.success('Stock received', { description: 'Available stock updated.' });
      setReceiveQty({});
    } catch (err) {
      toast.error('Could not receive', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  async function handleCancel() {
    try {
      await cancelMutation.mutateAsync();
      toast.success('Purchase order cancelled', { description: 'Outstanding incoming removed.' });
    } catch (err) {
      toast.error('Could not cancel', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

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
          <Link href="/dashboard/purchasing">
            <ArrowLeft className="size-4" />
            Back to purchasing
          </Link>
        </Button>
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          {error instanceof Error ? error.message : 'Purchase order not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard/purchasing">
          <ArrowLeft className="size-4" />
          Back to purchasing
        </Link>
      </Button>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{data.code}</h2>
        <PurchaseOrderStatusBadge status={data.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <p className="text-sm font-medium">
            Items <span className="text-muted-foreground">· {data.items.length}</span>
          </p>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Unit cost</TableHead>
                  {canReceive ? <TableHead className="text-right">Receive now</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-muted-foreground text-xs">{item.sku}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.receivedQuantity}
                      {item.outstanding > 0 ? (
                        <span className="text-muted-foreground"> / {item.outstanding} left</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(item.unitCost)}
                    </TableCell>
                    {canReceive ? (
                      <TableCell className="text-right">
                        {item.outstanding > 0 ? (
                          <div className="ml-auto w-20">
                            <NumberInput
                              value={receiveQty[item.id] ?? item.outstanding}
                              onChange={(value) =>
                                setReceiveQty((prev) => ({
                                  ...prev,
                                  [item.id]: Math.max(0, Math.min(value, item.outstanding)),
                                }))
                              }
                            />
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">done</span>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {canReceive ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleReceive()} disabled={busy}>
                <PackageCheck className="size-4" />
                {receiveMutation.isPending ? 'Receiving...' : 'Receive stock'}
              </Button>
              <Button variant="outline" onClick={() => void handleCancel()} disabled={busy}>
                <XCircle className="size-4" />
                Cancel PO
              </Button>
            </div>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Purchase order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Total cost</span>
                <span className="text-right font-semibold">{formatCurrency(data.totalCost)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Supplier</span>
                <span className="truncate text-right font-medium">{data.supplierName ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Ordered</span>
                <span className="text-right font-medium" suppressHydrationWarning>
                  {formatDateTime(data.orderedAt)}
                </span>
              </div>
              {data.receivedAt ? (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Received</span>
                  <span className="text-right font-medium" suppressHydrationWarning>
                    {formatDateTime(data.receivedAt)}
                  </span>
                </div>
              ) : null}
              {data.note ? (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Note</span>
                  <span className="truncate text-right font-medium">{data.note}</span>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
