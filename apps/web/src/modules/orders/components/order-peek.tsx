'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ExternalLink, Video } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/error-state';
import { StatusBadge } from '@/components/status-badge';
import { formatCurrency, formatDateTime } from '@/lib/formatters';
import { useRecordingsByResiQuery } from '@/modules/recordings/hooks/use-recordings-management';

import { useOrderQuery } from '../hooks/use-orders';
import type { OrderItemDetail } from '../types';
import { OrderStatusBadge } from './order-status-badge';

/** Label/value line — the compact twin of the detail page's "Pesanan" card rows. */
function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      {children}
    </div>
  );
}

/** One compact item line: name, variant/SKU, qty × unit price; warn when unmapped. */
function PeekItemRow({ item }: { item: OrderItemDetail }) {
  return (
    <li className="space-y-1.5 py-3 first:pt-2 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium break-words">{item.externalName}</p>
          <p className="text-muted-foreground text-xs">
            {item.variant ? (
              <>
                {item.variant.productName} / {item.variant.name} ·{' '}
                <span className="num">{item.variant.sku}</span>
              </>
            ) : item.externalSku ? (
              <span className="num">{item.externalSku}</span>
            ) : (
              '—'
            )}
          </p>
        </div>
        <span className="num shrink-0 text-sm whitespace-nowrap">
          {item.quantity} × {item.unitPrice ? formatCurrency(item.unitPrice) : '—'}
        </span>
      </div>
      {!item.resolved ? <StatusBadge tone="warn">Belum dikaitkan</StatusBadge> : null}
    </li>
  );
}

/** Packing-video evidence for the order's resi — count + jump to the library. */
function PeekPackingVideos({ noResi }: { noResi: string }) {
  const { data, isLoading, error, refetch } = useRecordingsByResiQuery(noResi);

  return (
    <section className="space-y-2 border-t pt-4">
      <p className="text-sm font-medium">Video packing</p>
      {isLoading ? (
        <Skeleton className="h-8 w-full" />
      ) : error ? (
        <ErrorState
          title="Gagal memuat video packing"
          onRetry={() => void refetch()}
          className="p-4"
        />
      ) : data && data.length > 0 ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            <span className="num">{data.length}</span> rekaman untuk resi ini — bukti sengketa.
          </p>
          <Button variant="outline" size="sm" asChild className="w-full">
            <Link href={`/dashboard/recordings?search=${encodeURIComponent(noResi)}`}>
              <Video className="size-4" />
              Lihat video packing
            </Link>
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          Belum ada video packing — rekam di station untuk resi ini.
        </p>
      )}
    </section>
  );
}

/** Layout-mirror skeleton: meta rows, then the item list. */
function OrderPeekSkeleton() {
  return (
    <div className="space-y-5 px-4">
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
      <div className="space-y-3 border-t pt-4">
        <Skeleton className="h-4 w-14" />
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Right-side read-only peek for an order — triage from the list without losing
 * scroll position or filters. Actions stay on the full detail page.
 */
export function OrderPeek({
  orderId,
  open,
  onOpenChange,
}: {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, error, refetch } = useOrderQuery(orderId, open);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader className="pr-12">
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {data ? (
              <>
                <span className="num">{data.externalOrderId}</span>
                <OrderStatusBadge status={data.status} />
                {data.fulfilledAt ? <StatusBadge tone="info">Fulfillment</StatusBadge> : null}
              </>
            ) : (
              'Ringkasan pesanan'
            )}
          </SheetTitle>
          <SheetDescription>Pratinjau cepat — aksi pesanan ada di halaman penuh.</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <OrderPeekSkeleton />
        ) : error || !data ? (
          <div className="px-4">
            <ErrorState
              title="Gagal memuat pesanan"
              description={error instanceof Error ? error.message : undefined}
              onRetry={() => void refetch()}
            />
          </div>
        ) : (
          <div className="space-y-5 px-4">
            <section className="space-y-2.5">
              <MetaRow label="Toko">
                <span className="truncate text-right font-medium">{data.shopName}</span>
              </MetaRow>
              <MetaRow label="Pembeli">
                <span className="truncate text-right font-medium">{data.buyerName ?? '—'}</span>
              </MetaRow>
              <MetaRow label="Dibuat">
                <span className="text-right font-medium" suppressHydrationWarning>
                  {formatDateTime(data.placedAt)}
                </span>
              </MetaRow>
              <MetaRow label="Total">
                <span className="num text-right font-medium">
                  {data.totalAmount ? formatCurrency(data.totalAmount) : '—'}
                </span>
              </MetaRow>
              <MetaRow label="No. resi">
                <span className="num truncate text-right font-medium">{data.noResi ?? '—'}</span>
              </MetaRow>
            </section>

            <section className="border-t pt-4">
              <p className="text-sm font-medium">
                Item{' '}
                <span className="text-muted-foreground">
                  · <span className="num">{data.items.length}</span>
                </span>
              </p>
              <ul className="divide-y">
                {data.items.map((item) => (
                  <PeekItemRow key={item.id} item={item} />
                ))}
              </ul>
            </section>

            {data.noResi ? <PeekPackingVideos noResi={data.noResi} /> : null}
          </div>
        )}

        <SheetFooter>
          {orderId ? (
            <Button asChild className="w-full">
              <Link href={`/dashboard/orders/${orderId}`}>
                <ExternalLink className="size-4" />
                Buka halaman penuh
              </Link>
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
