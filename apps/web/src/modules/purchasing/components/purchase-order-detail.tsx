'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Boxes, PackageCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
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
import { useHasPermission } from '@/modules/users/hooks/use-org';

import {
  useCancelPurchaseOrderMutation,
  usePurchaseOrderQuery,
  useReceivePurchaseOrderMutation,
} from '../hooks/use-purchase-orders';
import type { PurchaseOrderItemDetail } from '../types';
import { PurchaseOrderStatusBadge } from './purchase-order-status-badge';

/** A run of consecutive items sharing a bundle origin, or a single standalone item. */
type ItemGroup =
  | { kind: 'bundle'; bundleName: string; items: PurchaseOrderItemDetail[] }
  | { kind: 'standalone'; item: PurchaseOrderItemDetail };

/**
 * Fold the flat item list into display groups: consecutive lines sharing a
 * non-null `bundleName` collapse under one bundle header (they were created
 * together when the bundle line was exploded server-side, so they stay adjacent).
 */
function groupItems(items: PurchaseOrderItemDetail[]): ItemGroup[] {
  const groups: ItemGroup[] = [];
  for (const item of items) {
    if (item.bundleName) {
      const last = groups.at(-1);
      if (last?.kind === 'bundle' && last.bundleName === item.bundleName) {
        last.items.push(item);
      } else {
        groups.push({ kind: 'bundle', bundleName: item.bundleName, items: [item] });
      }
    } else {
      groups.push({ kind: 'standalone', item });
    }
  }
  return groups;
}

/** The bundle group caption — shared by the desktop table band and the mobile card list. */
function BundleGroupLabel({ bundleName }: { bundleName: string }) {
  return (
    <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
      <Boxes className="size-3.5 text-violet-500 dark:text-violet-400" />
      Bundel · {bundleName}
    </div>
  );
}

export function PurchaseOrderDetail({ purchaseOrderId }: { purchaseOrderId: string }) {
  const { data, isLoading, error } = usePurchaseOrderQuery(purchaseOrderId);
  const { allowed: canCancel } = useHasPermission('purchasing.cancel');
  const receiveMutation = useReceivePurchaseOrderMutation(purchaseOrderId);
  const cancelMutation = useCancelPurchaseOrderMutation(purchaseOrderId);
  // itemId → qty to receive this round (defaults to each line's outstanding).
  const [receiveQty, setReceiveQty] = useState<Record<string, number>>({});
  const [cancelOpen, setCancelOpen] = useState(false);

  const canReceive = data?.status === 'ORDERED' || data?.status === 'PARTIALLY_RECEIVED';
  const busy = receiveMutation.isPending || cancelMutation.isPending;

  function setItemReceiveQty(item: PurchaseOrderItemDetail, value: number) {
    setReceiveQty((prev) => ({
      ...prev,
      [item.id]: Math.max(0, Math.min(value, item.outstanding)),
    }));
  }

  /** One item row. `indented` nudges bundle-component lines under their group header. */
  function renderItemRow(item: PurchaseOrderItemDetail, indented: boolean) {
    return (
      <TableRow key={item.id}>
        <TableCell className={indented ? 'pl-8' : undefined}>
          <div className="font-medium">{item.name}</div>
          <div className="text-muted-foreground text-xs">{item.sku}</div>
        </TableCell>
        <TableCell className="num text-right">{item.quantity}</TableCell>
        <TableCell className="num text-right">
          {item.receivedQuantity}
          {item.outstanding > 0 ? (
            <span className="text-muted-foreground"> / sisa {item.outstanding}</span>
          ) : null}
        </TableCell>
        <TableCell className="num text-right">{formatCurrency(item.unitCost)}</TableCell>
        <TableCell className="num text-right font-medium">
          {formatCurrency(item.lineTotal)}
        </TableCell>
        {canReceive ? (
          <TableCell className="text-right">
            {item.outstanding > 0 ? (
              <div className="ml-auto w-20">
                <NumberInput
                  value={receiveQty[item.id] ?? item.outstanding}
                  onChange={(value) => setItemReceiveQty(item, value)}
                />
              </div>
            ) : (
              <span className="text-muted-foreground text-xs">Selesai</span>
            )}
          </TableCell>
        ) : null}
      </TableRow>
    );
  }

  /** One item card (<sm) — same figures as the table row, receive input full-width. */
  function renderItemCard(item: PurchaseOrderItemDetail) {
    return (
      <article key={item.id} className="bg-card space-y-3 rounded-xl border p-4">
        <div className="min-w-0">
          <div className="font-medium break-words">{item.name}</div>
          <div className="text-muted-foreground text-xs">{item.sku}</div>
        </div>

        <dl className="grid grid-cols-3 gap-2">
          <div>
            <dt className="text-muted-foreground text-xs">Dipesan</dt>
            <dd className="num font-medium">{item.quantity}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Diterima</dt>
            <dd className="num font-medium">{item.receivedQuantity}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Sisa</dt>
            <dd className="num font-medium">{item.outstanding}</dd>
          </div>
        </dl>

        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Modal satuan</span>
            <span className="num">{formatCurrency(item.unitCost)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Total</span>
            <span className="num font-medium">{formatCurrency(item.lineTotal)}</span>
          </div>
        </div>

        {canReceive ? (
          item.outstanding > 0 ? (
            <div className="space-y-1.5 border-t pt-3">
              <Label htmlFor={`receive-now-${item.id}`}>Terima sekarang</Label>
              <NumberInput
                id={`receive-now-${item.id}`}
                value={receiveQty[item.id] ?? item.outstanding}
                onChange={(value) => setItemReceiveQty(item, value)}
              />
            </div>
          ) : (
            <p className="text-muted-foreground border-t pt-3 text-xs">Selesai</p>
          )
        ) : null}
      </article>
    );
  }

  async function handleReceive() {
    if (!data) return;
    const lines = data.items
      .map((item) => ({
        purchaseOrderItemId: item.id,
        quantity: Math.min(receiveQty[item.id] ?? item.outstanding, item.outstanding),
      }))
      .filter((line) => line.quantity > 0);
    if (lines.length === 0) {
      toast.info('Tidak ada yang perlu diterima.');
      return;
    }
    try {
      await receiveMutation.mutateAsync({ lines });
      toast.success('Stok diterima', { description: 'Stok tersedia diperbarui.' });
      setReceiveQty({});
    } catch (err) {
      toast.error('Gagal menerima', {
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
      });
    }
  }

  async function handleCancel() {
    try {
      await cancelMutation.mutateAsync();
      setCancelOpen(false);
      toast.success('Pembelian dibatalkan', { description: 'Sisa stok akan datang dihapus.' });
    } catch (err) {
      toast.error('Gagal membatalkan', {
        description: err instanceof Error ? err.message : 'Terjadi kesalahan',
      });
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-44" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
          <Skeleton className="h-60 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/dashboard/purchasing">
            <ArrowLeft className="size-4" />
            Kembali ke pembelian
          </Link>
        </Button>
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          {error instanceof Error ? error.message : 'Pembelian tidak ditemukan.'}
        </div>
      </div>
    );
  }

  const groups = groupItems(data.items);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard/purchasing">
          <ArrowLeft className="size-4" />
          Kembali ke pembelian
        </Link>
      </Button>

      <div className="space-y-1">
        <p className="eyebrow text-primary">Pembelian</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="num text-2xl font-semibold tracking-tight">{data.code}</h1>
          <PurchaseOrderStatusBadge status={data.status} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <p className="text-sm font-medium">
            Item{' '}
            <span className="text-muted-foreground">
              · <span className="num">{data.items.length}</span>
            </span>
          </p>

          {/* Desktop table — the same lines render as cards below sm. */}
          <div className="hidden overflow-x-auto rounded-xl border sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Dipesan</TableHead>
                  <TableHead className="text-right">Diterima</TableHead>
                  <TableHead className="text-right">Modal satuan</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  {canReceive ? (
                    <TableHead className="text-right">Terima sekarang</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) =>
                  group.kind === 'bundle' ? (
                    <Fragment key={`bundle-${group.bundleName}-${group.items[0]?.id}`}>
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={canReceive ? 6 : 5} className="bg-muted/30 py-2">
                          <BundleGroupLabel bundleName={group.bundleName} />
                        </TableCell>
                      </TableRow>
                      {group.items.map((item) => renderItemRow(item, true))}
                    </Fragment>
                  ) : (
                    renderItemRow(group.item, false)
                  ),
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card list — same data, the receive input gets a full-width row. */}
          <div className="space-y-3 sm:hidden">
            {groups.map((group) =>
              group.kind === 'bundle' ? (
                <div key={`bundle-${group.bundleName}-${group.items[0]?.id}`} className="space-y-3">
                  <BundleGroupLabel bundleName={group.bundleName} />
                  {group.items.map((item) => renderItemCard(item))}
                </div>
              ) : (
                renderItemCard(group.item)
              ),
            )}
          </div>

          {canReceive ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleReceive()} disabled={busy}>
                <PackageCheck className="size-4" />
                {receiveMutation.isPending ? 'Menerima...' : 'Terima stok'}
              </Button>
              {canCancel ? (
                <Button variant="outline" onClick={() => setCancelOpen(true)} disabled={busy}>
                  <XCircle className="size-4" />
                  Batalkan pembelian
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pembelian</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Total modal</span>
                <span className="num text-right font-semibold">
                  {formatCurrency(data.totalCost)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Pemasok</span>
                <span className="truncate text-right font-medium">{data.supplierName ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Dipesan</span>
                <span className="text-right font-medium" suppressHydrationWarning>
                  {formatDateTime(data.orderedAt)}
                </span>
              </div>
              {data.receivedAt ? (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Diterima</span>
                  <span className="text-right font-medium" suppressHydrationWarning>
                    {formatDateTime(data.receivedAt)}
                  </span>
                </div>
              ) : null}
              {data.note ? (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Catatan</span>
                  <span className="truncate text-right font-medium">{data.note}</span>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan pembelian ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Sisa barang yang belum diterima dari <span className="num">{data.code}</span> bakal
              dihapus dari hitungan stok akan datang, dan pembelian ini nggak bisa diterima lagi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>Nggak jadi</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleCancel();
              }}
            >
              {cancelMutation.isPending ? 'Membatalkan...' : 'Batalkan pembelian'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
