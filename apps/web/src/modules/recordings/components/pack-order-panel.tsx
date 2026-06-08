'use client';

import Link from 'next/link';
import { PackageSearch } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useOrderByResiQuery } from '@/modules/orders/hooks/use-orders';

/**
 * Read-only "what to pack" panel for the recording station: when the entered/scanned
 * resi matches an order, shows the order's items so the operator packs while recording.
 * Purely additive — it does NOT touch the recording lifecycle, and shows nothing for an
 * ad-hoc resi with no matching order.
 */
export function PackOrderPanel({ noResi }: { noResi: string }) {
  const debounced = useDebouncedValue(noResi.trim(), 400);
  const enabled = debounced.length >= 3;
  const { data: order, isLoading } = useOrderByResiQuery(enabled ? debounced : null);

  if (!enabled) return null;

  if (isLoading) {
    return (
      <div className="text-muted-foreground rounded-lg border p-3 text-xs">Mencari pesanan…</div>
    );
  }

  if (!order) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-3 text-xs">
        Nggak ada pesanan yang cocok sama resi ini — rekamannya tetap disimpan kok.
      </div>
    );
  }

  return (
    <div className="bg-muted/30 space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium">
          <PackageSearch className="size-4" />
          Barang untuk dikemas
        </span>
        <Badge variant="secondary">{order.status}</Badge>
      </div>
      <div className="text-muted-foreground text-xs">
        {order.shopName} · {order.buyerName ?? '—'} ·{' '}
        <Link href={`/dashboard/orders/${order.id}`} className="hover:text-foreground underline">
          {order.externalOrderId}
        </Link>
      </div>
      <ul className="space-y-1">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2">
            <span className="truncate">
              {item.variant
                ? `${item.variant.productName} / ${item.variant.name}`
                : item.externalName}
            </span>
            <span className="num font-medium">×{item.quantity}</span>
          </li>
        ))}
      </ul>
      {order.unresolvedCount > 0 ? (
        <p className="text-xs text-amber-600">
          {order.unresolvedCount} item belum dikaitkan ke produk kamu.
        </p>
      ) : null}
      {order.fulfilledAt ? (
        <p className="text-xs text-emerald-600">
          Pesanan ini sudah pernah dikemas — ini nambah video lagi.
        </p>
      ) : null}
    </div>
  );
}
