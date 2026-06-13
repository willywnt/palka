'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Ban, Boxes, ReceiptText, Undo2 } from 'lucide-react';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
import { StatusBadge } from '@/components/status-badge';
import { formatCurrency, formatDateTime } from '@/lib/formatters';
import { useHasPermission } from '@/modules/users/hooks/use-org';

import { useSaleQuery, useVoidSaleMutation } from '../hooks/use-sales';
import type { SaleItemDetail } from '../types';
import { paymentMethodLabel } from './pos-terminal';
import { ReceiptDialog } from './receipt-dialog';
import { RefundSaleDialog } from './refund-sale-dialog';

/** A run of consecutive items sharing a bundle origin, or a single standalone item. */
type ItemGroup =
  | { kind: 'bundle'; bundleName: string; items: SaleItemDetail[] }
  | { kind: 'standalone'; item: SaleItemDetail };

/** Fold the flat item list into display groups — consecutive lines from one bundle collapse. */
function groupItems(items: SaleItemDetail[]): ItemGroup[] {
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

export function SaleDetail({ saleId }: { saleId: string }) {
  const { data, isLoading, error } = useSaleQuery(saleId);
  const { allowed: canRefund } = useHasPermission('sales.refund');
  const voidMutation = useVoidSaleMutation();
  const [voidOpen, setVoidOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);

  async function handleVoid() {
    try {
      await voidMutation.mutateAsync(saleId);
      toast.success('Penjualan dibatalkan', { description: 'Semua item sudah direstok.' });
      setVoidOpen(false);
    } catch (caught) {
      toast.error('Gagal membatalkan penjualan', {
        description: caught instanceof Error ? caught.message : 'Coba lagi.',
      });
    }
  }

  if (isLoading) {
    // Mirrors the loaded layout: back link → eyebrow + title → items column + aside.
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-56" />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-56 w-full rounded-xl" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/dashboard/sales">
            <ArrowLeft className="size-4" />
            Kembali ke penjualan
          </Link>
        </Button>
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
          {error instanceof Error ? error.message : 'Penjualan tidak ditemukan.'}
        </div>
      </div>
    );
  }

  const groups = groupItems(data.items);

  const renderSaleItemRow = (item: SaleItemDetail, indented: boolean) => (
    <TableRow key={item.id}>
      <TableCell className={indented ? 'pl-8' : undefined}>
        <div className="flex items-center gap-3">
          <ImageThumb src={item.imageUrl} alt={item.name} />
          <div className="min-w-0">
            <div className="font-medium">{item.name}</div>
            <div className="text-muted-foreground text-xs">{item.sku}</div>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <span className="num">{item.quantity}</span>
        {item.refundedQuantity > 0 ? (
          <div className="text-status-warn text-xs whitespace-nowrap">
            <span className="num">{item.refundedQuantity}</span> di-refund
          </div>
        ) : null}
      </TableCell>
      <TableCell className="num text-right">{formatCurrency(item.unitPrice)}</TableCell>
      <TableCell className="num text-right font-medium">{formatCurrency(item.lineTotal)}</TableCell>
    </TableRow>
  );

  // Mobile twin of renderSaleItemRow — same data, stacked.
  const renderSaleItemCard = (item: SaleItemDetail) => (
    <div key={item.id} className="space-y-2 p-4">
      <div className="flex items-center gap-3">
        <ImageThumb src={item.imageUrl} alt={item.name} />
        <div className="min-w-0">
          <div className="truncate font-medium">{item.name}</div>
          <div className="text-muted-foreground text-xs">{item.sku}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <span className="text-muted-foreground">
          <span className="num text-foreground font-medium">{item.quantity}</span> ×{' '}
          <span className="num">{formatCurrency(item.unitPrice)}</span>
        </span>
        <span className="num font-medium">{formatCurrency(item.lineTotal)}</span>
      </div>
      {item.refundedQuantity > 0 ? (
        <p className="text-status-warn text-xs">
          <span className="num">{item.refundedQuantity}</span> di-refund
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/dashboard/sales">
            <ArrowLeft className="size-4" />
            Kembali ke penjualan
          </Link>
        </Button>
        <p className="eyebrow text-primary mt-2">Penjualan</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="num text-2xl font-semibold tracking-tight">{data.code}</h1>
          <Badge variant="secondary">{paymentMethodLabel(data.paymentMethod)}</Badge>
          {data.status === 'VOID' ? <StatusBadge tone="danger">Dibatalkan</StatusBadge> : null}
          {data.status === 'PARTIALLY_REFUNDED' ? (
            <StatusBadge tone="warn">Refund sebagian</StatusBadge>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            {canRefund &&
            data.status !== 'VOID' &&
            data.items.some((item) => item.quantity - item.refundedQuantity > 0) ? (
              <Button variant="outline" size="sm" onClick={() => setRefundOpen(true)}>
                <Undo2 className="size-4" />
                Refund
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => setReceiptOpen(true)}>
              <ReceiptText className="size-4" />
              Struk
            </Button>
          </div>
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

          {/* Desktop: the full table. */}
          <div className="hidden rounded-xl border sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Harga satuan</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) =>
                  group.kind === 'bundle' ? (
                    <Fragment key={`bundle-${group.bundleName}-${group.items[0]?.id}`}>
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={4} className="bg-muted/30 py-2">
                          <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                            <Boxes className="size-3.5 text-violet-500 dark:text-violet-400" />
                            Bundel · {group.bundleName}
                          </div>
                        </TableCell>
                      </TableRow>
                      {group.items.map((item) => renderSaleItemRow(item, true))}
                    </Fragment>
                  ) : (
                    renderSaleItemRow(group.item, false)
                  ),
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: stacked cards — same data, bundle lines stay grouped. */}
          <div className="space-y-3 sm:hidden">
            {groups.map((group) =>
              group.kind === 'bundle' ? (
                <div
                  key={`bundle-${group.bundleName}-${group.items[0]?.id}`}
                  className="bg-card overflow-hidden rounded-xl border"
                >
                  <div className="text-muted-foreground bg-muted/30 flex items-center gap-1.5 border-b px-4 py-2 text-xs font-medium">
                    <Boxes className="size-3.5 text-violet-500 dark:text-violet-400" />
                    Bundel · {group.bundleName}
                  </div>
                  <div className="divide-y">{group.items.map(renderSaleItemCard)}</div>
                </div>
              ) : (
                <div key={group.item.id} className="bg-card rounded-xl border">
                  {renderSaleItemCard(group.item)}
                </div>
              ),
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Penjualan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {Number(data.discountAmount) > 0 || Number(data.taxAmount) > 0 ? (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="num text-right">{formatCurrency(data.subtotalAmount)}</span>
                  </div>
                  {Number(data.discountAmount) > 0 ? (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Diskon</span>
                      <span className="num text-signed-down text-right">
                        −{formatCurrency(data.discountAmount)}
                      </span>
                    </div>
                  ) : null}
                  {Number(data.taxAmount) > 0 ? (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">
                        PPN <span className="num">{data.taxRate}%</span>
                        {data.taxInclusive ? ' (termasuk)' : ''}
                      </span>
                      <span className="num text-right">{formatCurrency(data.taxAmount)}</span>
                    </div>
                  ) : null}
                </>
              ) : null}
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Total harga</span>
                <span className="num text-right font-semibold">
                  {formatCurrency(data.totalAmount)}
                </span>
              </div>
              {Number(data.refundedAmount) > 0 ? (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Total refund</span>
                  <span className="num text-signed-down text-right font-medium">
                    −{formatCurrency(data.refundedAmount)}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Pembayaran</span>
                <span className="text-right font-medium">
                  {paymentMethodLabel(data.paymentMethod)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Pelanggan</span>
                <span className="truncate text-right font-medium">
                  {data.customerName ?? 'Pelanggan langsung'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Terjual</span>
                <span className="text-right font-medium" suppressHydrationWarning>
                  {formatDateTime(data.createdAt)}
                </span>
              </div>
              {data.note ? (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Catatan</span>
                  <span className="truncate text-right font-medium">{data.note}</span>
                </div>
              ) : null}
              {data.refunds.length > 0 ? (
                <div className="space-y-1.5 border-t pt-3">
                  <p className="text-muted-foreground text-xs font-medium">Riwayat refund</p>
                  {data.refunds.map((refund) => (
                    <div
                      key={refund.id}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="min-w-0 truncate">
                        <span className="num font-medium">{refund.code}</span>{' '}
                        <span className="text-muted-foreground" suppressHydrationWarning>
                          · {formatDateTime(refund.createdAt)}
                        </span>
                      </span>
                      <span className="num shrink-0">−{formatCurrency(refund.totalAmount)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {canRefund && data.status === 'COMPLETED' ? (
            <AlertDialog open={voidOpen} onOpenChange={setVoidOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive w-full"
                >
                  <Ban className="size-4" />
                  Batalkan penjualan
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Batalkan penjualan <span className="num">{data.code}</span>?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Semua item bakal direstok ke stok tersedia dan penjualan ini gak dihitung lagi
                    di laporan laba. Aksi ini gak bisa diurungkan.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={voidMutation.isPending}>Batal</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={voidMutation.isPending}
                    onClick={(event) => {
                      event.preventDefault();
                      void handleVoid();
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {voidMutation.isPending ? 'Membatalkan…' : 'Batalkan penjualan'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </aside>
      </div>

      <ReceiptDialog sale={data} open={receiptOpen} onOpenChange={setReceiptOpen} />
      <RefundSaleDialog sale={data} open={refundOpen} onOpenChange={setRefundOpen} />
    </div>
  );
}
