import type { Route } from 'next';

export type PanduDestination = { href: Route; label: string };

/**
 * Honest keyword router (the NL stub): maps a free-text question onto an
 * existing screen/URL-filter. It never generates an answer — no match returns
 * null and the dock shows suggestion chips instead. Swapping this function for
 * the real assistant later is the entire upgrade path.
 */

/* Words stripped before using the remainder as an inventory search term. */
const FILLER =
  /\b(stok|sisa|berapa|cek|coba|lihat|tampilkan|tolong|dong|info|punya|masih|ada|produk|varian|sku|barang|si)\b/g;

export function routePanduQuery(raw: string): PanduDestination | null {
  const q = raw.toLowerCase().trim();
  if (!q) return null;

  if (/(restok|reorder|menipis|hampir habis|saran beli)/.test(q)) {
    return { href: '/dashboard/inventory/reorder', label: 'Saran restok' };
  }
  if (/\b(po|pembelian|pemasok|supplier)\b/.test(q)) {
    return { href: '/dashboard/purchasing', label: 'Pembelian' };
  }
  if (/(pesanan|resi|order)/.test(q)) {
    return { href: '/dashboard/orders', label: 'Pesanan' };
  }
  if (/(retur|komplain|refund|kembali(an)? barang)/.test(q)) {
    return { href: '/dashboard/returns', label: 'Retur' };
  }
  if (/(kasir|penjualan|jualan|\bpos\b)/.test(q)) {
    return { href: '/dashboard/sales', label: 'Penjualan (Kasir)' };
  }
  if (/(rekam|video|packing|bukti)/.test(q)) {
    return { href: '/dashboard/recordings', label: 'Rekaman' };
  }
  if (/(laba|omzet|margin|laporan|channel|untung|rugi)/.test(q)) {
    return { href: '/dashboard/reports/profit', label: 'Laba & channel' };
  }
  if (/(nilai stok|modal stok|valuasi)/.test(q)) {
    return { href: '/dashboard/reports/inventory-value', label: 'Nilai stok' };
  }
  if (/(\blabel\b|\bqr\b)/.test(q)) {
    return { href: '/dashboard/labels', label: 'Label' };
  }
  if (/(bundel|paket hemat)/.test(q)) {
    return { href: '/dashboard/bundles', label: 'Bundel' };
  }
  if (/(marketplace|shopee|tokopedia|lazada|listing|toko online)/.test(q)) {
    return { href: '/dashboard/marketplace', label: 'Marketplace' };
  }
  if (/(stok|sisa|inventaris|varian|produk|sku|barang)/.test(q)) {
    const term = q
      .replace(FILLER, ' ')
      .replace(/[?!.,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (term) {
      return {
        href: `/dashboard/inventory?search=${encodeURIComponent(term)}` as Route,
        label: `Cari "${term}" di inventaris`,
      };
    }
    return { href: '/dashboard/inventory', label: 'Inventaris' };
  }

  return null;
}

/** Fallback chips when a question doesn't match anything yet. */
export const PANDU_SUGGESTIONS: readonly PanduDestination[] = [
  { href: '/dashboard/inventory/reorder', label: 'Apa yang perlu direstok?' },
  { href: '/dashboard/orders', label: 'Pesanan terbaru' },
  { href: '/dashboard/reports/profit', label: 'Laba minggu ini' },
];
