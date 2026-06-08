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
      toast.success('Retur dibuka', {
        description: 'Proses returnya untuk restok atau tandai sebagai stok rusak.',
      });
      router.push(`/dashboard/returns/${created.id}`);
    } catch (err) {
      toast.error('Gagal membuka retur', {
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
      });
    }
  }

  async function handleResolve(variantId: string) {
    if (!mapTarget) return;
    try {
      await resolveMutation.mutateAsync({ orderItemId: mapTarget.id, variantId });
      toast.success('Item dikaitkan', {
        description: 'Stok ikut diperbarui kalau pesanan sudah dibayar.',
      });
      setMapTarget(null);
    } catch (error) {
      toast.error('Gagal mengaitkan item', {
        description: error instanceof Error ? error.message : 'Terjadi kesalahan',
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
            Kembali ke pesanan
          </Link>
        </Button>
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          {error instanceof Error ? error.message : 'Pesanan tidak ditemukan.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard/orders">
          <ArrowLeft className="size-4" />
          Kembali ke pesanan
        </Link>
      </Button>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{data.externalOrderId}</h2>
        <OrderStatusBadge status={data.status} />
        {data.fulfilledAt ? (
          <Badge className="bg-sky-600 text-white hover:bg-sky-600">Fulfillment</Badge>
        ) : null}
        <div className="ml-auto">
          <OrderActionsMenu order={data} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <p className="text-sm font-medium">
            Item <span className="text-muted-foreground">· {data.items.length}</span>
          </p>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Harga satuan</TableHead>
                  <TableHead>Dikaitkan ke</TableHead>
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
                    <TableCell className="num text-right">{item.quantity}</TableCell>
                    <TableCell className="num text-right">
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
                            Belum dikaitkan
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
                            Kaitkan
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
              Stok sudah diperbarui untuk pesanan ini.
            </div>
          ) : data.status === 'PAID' && data.unresolvedCount > 0 ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700">
              {data.unresolvedCount} item belum dikaitkan ke produk, jadi stok belum diperbarui.
              Kaitkan listing-nya, lalu tarik pesanan lagi.
            </div>
          ) : data.status === 'PAID' ? (
            <div className="text-muted-foreground rounded-lg border p-3 text-sm">
              Stok belum diperbarui untuk pesanan ini.
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pesanan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Toko</span>
                <span className="truncate text-right font-medium">{data.shopName}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Pembeli</span>
                <span className="truncate text-right font-medium">{data.buyerName ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Dibuat</span>
                <span className="text-right font-medium" suppressHydrationWarning>
                  {formatDateTime(data.placedAt)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Total</span>
                <span className="num text-right font-medium">
                  {data.totalAmount ? formatCurrency(data.totalAmount) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">No. resi</span>
                <span className="truncate text-right font-medium">{data.noResi ?? '—'}</span>
              </div>
              {data.status === 'CANCELLED' && data.cancelReason ? (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground shrink-0">Alasan batal</span>
                  <span className="text-right font-medium">{data.cancelReason}</span>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {data.noResi ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Video packing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {packingVideos && packingVideos.length > 0 ? (
                  <>
                    <p className="text-muted-foreground text-xs">
                      {packingVideos.length} rekaman untuk resi ini — bukti sengketa.
                    </p>
                    <Button variant="outline" size="sm" asChild className="w-full">
                      <Link
                        href={`/dashboard/recordings?search=${encodeURIComponent(data.noResi)}`}
                      >
                        <Video className="size-4" />
                        Lihat video packing
                      </Link>
                    </Button>
                    <ShareEvidenceControl recordings={packingVideos} />
                  </>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Belum ada video packing — rekam di station untuk resi ini.
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
              {createReturnMutation.isPending ? 'Membuka...' : 'Buka retur'}
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
          title="Kaitkan ke produk"
          description={mapTarget.label}
          busy={resolveMutation.isPending}
          onSelect={(variantId) => void handleResolve(variantId)}
        />
      ) : null}
    </div>
  );
}
