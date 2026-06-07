'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Link2, Undo2, Video } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ImageThumb } from '@/components/image-thumb';
import { formatCurrency, formatDateTime } from '@/lib/formatters';

import { VariantPickerDialog } from '@/components/variant-picker-dialog';
import { ShareEvidenceControl } from '@/modules/recordings/components/share-evidence-control';
import { useRecordingsByResiQuery } from '@/modules/recordings/hooks/use-recordings-management';
import { useCreateReturnMutation } from '@/modules/returns/hooks/use-returns';

import { useOrderQuery, useResolveOrderItemMutation } from '../hooks/use-orders';
import { OrderActionsMenu } from './order-actions-menu';
import { OrderStatusBadge } from './order-status-badge';

export function OrderDetail({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { data, isLoading, error } = useOrderQuery(orderId);
  const resolveMutation = useResolveOrderItemMutation(orderId);
  const createReturnMutation = useCreateReturnMutation();
  const { data: packingVideos } = useRecordingsByResiQuery(data?.noResi ?? null);
  const [mapTarget, setMapTarget] = useState<{ id: string; label: string } | null>(null);

  async function handleCreateReturn() {
    try {
      const created = await createReturnMutation.mutateAsync({ orderId });
      toast.success('Return opened', { description: 'Receive it to restock or write off goods.' });
      router.push(`/dashboard/returns/${created.id}`);
    } catch (err) {
      toast.error('Could not open a return', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  async function handleResolve(variantId: string) {
    if (!mapTarget) return;
    try {
      await resolveMutation.mutateAsync({ orderItemId: mapTarget.id, variantId });
      toast.success('Item matched', { description: 'Stock is updated if the order is paid.' });
      setMapTarget(null);
    } catch (error) {
      toast.error('Could not match item', {
        description: error instanceof Error ? error.message : 'Unknown error',
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

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{data.externalOrderId}</h2>
        <OrderStatusBadge status={data.status} />
        {data.fulfilledAt ? (
          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Fulfilled</Badge>
        ) : null}
        <div className="ml-auto">
          <OrderActionsMenu order={data} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <p className="text-sm font-medium">
            Items <span className="text-muted-foreground">· {data.items.length}</span>
          </p>
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
                        <div className="flex items-center gap-3">
                          <ImageThumb src={item.variant.imageUrl} alt={item.variant.name} />
                          <div className="min-w-0">
                            <Badge variant="secondary">{item.variant.sku}</Badge>
                            <div className="text-muted-foreground text-xs">
                              {item.variant.productName} / {item.variant.name}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="border-amber-500 text-amber-600">
                            Unmapped
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setMapTarget({
                                id: item.id,
                                label: `${item.externalName}${item.externalSku ? ` · ${item.externalSku}` : ''}`,
                              })
                            }
                          >
                            <Link2 className="size-4" />
                            Map
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <aside className="space-y-4">
          {data.inventoryApplied ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">
              Stock has been updated for this order.
            </div>
          ) : data.status === 'PAID' && data.unresolvedCount > 0 ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700">
              {data.unresolvedCount} item(s) are not matched to a product yet, so stock was not
              updated. Match the listing, then pull orders again.
            </div>
          ) : data.status === 'PAID' ? (
            <div className="text-muted-foreground rounded-lg border p-3 text-sm">
              Stock not updated for this order yet.
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Store</span>
                <span className="truncate text-right font-medium">{data.shopName}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Buyer</span>
                <span className="truncate text-right font-medium">{data.buyerName ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Placed</span>
                <span className="text-right font-medium" suppressHydrationWarning>
                  {formatDateTime(data.placedAt)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Total</span>
                <span className="text-right font-medium">
                  {data.totalAmount ? formatCurrency(data.totalAmount) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Tracking no.</span>
                <span className="truncate text-right font-medium">{data.noResi ?? '—'}</span>
              </div>
              {data.status === 'CANCELLED' && data.cancelReason ? (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground shrink-0">Cancel reason</span>
                  <span className="text-right font-medium">{data.cancelReason}</span>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {data.noResi ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Packing video</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {packingVideos && packingVideos.length > 0 ? (
                  <>
                    <p className="text-muted-foreground text-xs">
                      {packingVideos.length} recording(s) for this resi — dispute evidence.
                    </p>
                    <Button variant="outline" size="sm" asChild className="w-full">
                      <Link
                        href={`/dashboard/recordings?search=${encodeURIComponent(data.noResi)}`}
                      >
                        <Video className="size-4" />
                        View packing video
                      </Link>
                    </Button>
                    <ShareEvidenceControl recordings={packingVideos} />
                  </>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    No packing video yet — record one at the station for this resi.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : null}

          {data.status === 'SHIPPED' || data.status === 'COMPLETED' ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void handleCreateReturn()}
              disabled={createReturnMutation.isPending}
            >
              <Undo2 className="size-4" />
              {createReturnMutation.isPending ? 'Opening...' : 'Open a return'}
            </Button>
          ) : null}
        </aside>
      </div>

      {mapTarget ? (
        <VariantPickerDialog
          open={Boolean(mapTarget)}
          onOpenChange={(next) => {
            if (!next) setMapTarget(null);
          }}
          title="Match to a product"
          description={mapTarget.label}
          busy={resolveMutation.isPending}
          onSelect={(variantId) => void handleResolve(variantId)}
        />
      ) : null}
    </div>
  );
}
