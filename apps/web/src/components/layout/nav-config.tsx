import type { Route } from 'next';
import type { OrgRole } from '@falka/types';
import {
  Boxes,
  ClipboardCheck,
  Coins,
  LayoutDashboard,
  Layers,
  Library,
  LineChart,
  PackageSearch,
  QrCode,
  ScrollText,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  TrendingDown,
  Truck,
  Undo2,
  Video,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';

import { orgRoleAtLeast } from '@/lib/org-role';
import type { PermissionKey } from '@/modules/users/permissions/catalog';

/*
 * Single source of truth for shell navigation: the sidebar IA, the mobile tab
 * bar, the "Buat" create menu, the command palette, and the bottom-of-screen
 * route-ownership list all read from here so they can never drift apart.
 *
 * IA is grouped by the seller's JOBS in daily-frequency order (jual → stok →
 * katalog → kirim → laporan), not by entity nouns — every route keeps its URL,
 * and the formerly nav-orphaned screens (saran restok, aktivitas stok) are
 * promoted to first-class items.
 */

/** Live "needs my attention" counters served by use-ops-pulse. */
export type OpsPulseKey =
  | 'ordersToShip'
  | 'returnsPending'
  | 'restockUrgent'
  | 'marketplaceUnhealthy';

export type NavItem = {
  title: string;
  href: Route;
  icon: LucideIcon;
  /** Which ops-pulse counter badges this item (rendered only when > 0). */
  pulse?: OpsPulseKey;
  /** Extra lowercase match words for the command palette. */
  keywords?: readonly string[];
  /** Minimum org role to SEE this item — cosmetic hiding only; the server still guards. */
  minRole?: 'ADMIN' | 'OWNER';
  /** Permission key the effective set must include to SEE this item — cosmetic; server still guards. */
  permission?: PermissionKey;
};

export type NavSection = {
  label?: string;
  items: readonly NavItem[];
};

export const sidebarNavSections: readonly NavSection[] = [
  {
    items: [
      {
        title: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        keywords: ['anjungan', 'beranda', 'home', 'ringkasan'],
      },
    ],
  },
  {
    label: 'Jualan',
    items: [
      {
        title: 'Kasir (POS)',
        href: '/dashboard/sales',
        icon: Store,
        keywords: ['kasir', 'pos', 'penjualan', 'jual', 'struk', 'offline'],
      },
      {
        title: 'Pesanan online',
        href: '/dashboard/orders',
        icon: ShoppingCart,
        pulse: 'ordersToShip',
        keywords: ['pesanan', 'order', 'resi', 'kirim'],
      },
      {
        title: 'Marketplace',
        href: '/dashboard/marketplace',
        icon: ShoppingBag,
        pulse: 'marketplaceUnhealthy',
        keywords: ['marketplace', 'shopee', 'tokopedia', 'lazada', 'listing', 'toko', 'sinkron'],
        permission: 'marketplace.view',
      },
    ],
  },
  {
    label: 'Stok',
    items: [
      {
        title: 'Inventaris',
        href: '/dashboard/inventory',
        icon: Warehouse,
        keywords: ['inventaris', 'stok', 'gudang', 'sisa'],
      },
      {
        title: 'Saran restok',
        href: '/dashboard/inventory/reorder',
        icon: PackageSearch,
        pulse: 'restockUrgent',
        keywords: ['restok', 'reorder', 'saran', 'menipis', 'habis'],
      },
      {
        title: 'Opname stok',
        href: '/dashboard/inventory/opname',
        icon: ClipboardCheck,
        keywords: ['opname', 'hitung', 'cycle count', 'selisih'],
      },
      {
        title: 'Aktivitas stok',
        href: '/dashboard/inventory/activity',
        icon: ScrollText,
        keywords: ['aktivitas', 'riwayat', 'ledger', 'mutasi', 'pergerakan'],
      },
      {
        title: 'Pembelian (PO)',
        href: '/dashboard/purchasing',
        icon: Truck,
        keywords: ['pembelian', 'po', 'purchase', 'supplier', 'pemasok', 'terima barang'],
        permission: 'purchasing.view',
      },
    ],
  },
  {
    label: 'Katalog',
    items: [
      {
        title: 'Produk',
        href: '/dashboard/products',
        icon: Boxes,
        keywords: ['produk', 'barang', 'varian', 'sku', 'katalog'],
      },
      {
        title: 'Bundel',
        href: '/dashboard/bundles',
        icon: Layers,
        keywords: ['bundel', 'bundling', 'paket', 'kit'],
      },
      {
        title: 'Label QR',
        href: '/dashboard/labels',
        icon: QrCode,
        keywords: ['label', 'qr', 'cetak', 'print', 'barcode'],
      },
    ],
  },
  {
    label: 'Kirim & retur',
    items: [
      // "Rekam packing" vs "Rekaman": one letter apart was an easy mis-tap.
      {
        title: 'Rekam packing',
        href: '/recordings',
        icon: Video,
        keywords: ['rekam', 'packing', 'kamera', 'stasiun', 'scan resi'],
      },
      {
        title: 'Rekaman',
        href: '/dashboard/recordings',
        icon: Library,
        keywords: ['rekaman', 'video', 'bukti', 'arsip'],
      },
      {
        title: 'Retur',
        href: '/dashboard/returns',
        icon: Undo2,
        pulse: 'returnsPending',
        keywords: ['retur', 'komplain', 'pengembalian', 'rma', 'refund'],
      },
    ],
  },
  {
    label: 'Laporan',
    items: [
      {
        title: 'Laba & channel',
        href: '/dashboard/reports/profit',
        icon: LineChart,
        keywords: ['laba', 'profit', 'omzet', 'margin', 'channel', 'laporan'],
        permission: 'reports.view',
      },
      {
        title: 'Nilai stok',
        href: '/dashboard/reports/inventory-value',
        icon: Coins,
        keywords: ['nilai', 'valuasi', 'modal', 'aset'],
        permission: 'reports.view',
      },
      {
        title: 'Stok mati & ABC',
        href: '/dashboard/reports/dead-stock',
        icon: TrendingDown,
        keywords: ['stok mati', 'dead stock', 'abc', 'pareto', 'mengendap'],
        permission: 'reports.view',
      },
    ],
  },
  {
    label: 'Sistem',
    items: [
      {
        title: 'Pengaturan',
        href: '/settings',
        icon: Settings,
        keywords: ['pengaturan', 'setting', 'akun', 'tema'],
      },
    ],
  },
];

/* Ordered by real creation frequency: counter sale, restock PO, product, packing video. */
export const CREATE_ACTIONS: readonly NavItem[] = [
  {
    title: 'Penjualan kasir',
    href: '/dashboard/sales/new',
    icon: Store,
    keywords: ['jual', 'kasir', 'pos', 'transaksi baru'],
  },
  {
    title: 'Pembelian (PO)',
    href: '/dashboard/purchasing/new',
    icon: Truck,
    keywords: ['beli', 'po baru', 'restok'],
    permission: 'purchasing.view',
  },
  {
    title: 'Produk baru',
    href: '/dashboard/products',
    icon: Boxes,
    keywords: ['tambah produk', 'produk baru'],
  },
  {
    title: 'Rekam packing',
    href: '/recordings',
    icon: Video,
    keywords: ['rekam', 'packing'],
  },
];

/* The five flows a seller actually runs from a phone. */
export const MOBILE_TABS: readonly NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Pesanan', href: '/dashboard/orders', icon: ShoppingCart, pulse: 'ordersToShip' },
  { title: 'Kasir', href: '/dashboard/sales', icon: Store },
  { title: 'Stok', href: '/dashboard/inventory', icon: Warehouse },
  { title: 'Rekaman', href: '/dashboard/recordings', icon: Library },
];

/*
 * Routes that own the bottom of the screen / full attention (sticky Bayar bar,
 * scan flows, the recording station) — the tab bar and the Pandu dock both
 * step aside there. ONE list so they can't drift.
 */
export const SHELL_SUPPRESSED_ROUTES: readonly string[] = [
  '/recordings',
  '/dashboard/sales/new',
  '/dashboard/purchasing/new',
  '/dashboard/orders/board',
];

export function isShellSuppressedRoute(pathname: string): boolean {
  return SHELL_SUPPRESSED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/** Highlight the most specific matching item so a parent route never lights up a child's row. */
export function resolveActiveHref(pathname: string, items: readonly NavItem[]): string | undefined {
  let best: string | undefined;

  for (const item of items) {
    const href: string = item.href;
    const matches = pathname === href || pathname.startsWith(`${href}/`);

    if (matches && (best === undefined || href.length > best.length)) {
      best = href;
    }
  }

  return best;
}

/**
 * Cosmetic visibility gate shared by the sidebar, the mobile tabs, and the
 * command palette — an item shows when its role floor is met (`null` org, still
 * loading / unknown, reads as STAFF) AND its permission (if any) is in the
 * effective set (`null` permissions reads as none). Both gates default to
 * HIDING so privileged items never flash. Server guards remain the real boundary.
 */
export function navItemAllowed(
  item: Pick<NavItem, 'minRole' | 'permission'>,
  role: OrgRole | null,
  permissions: readonly PermissionKey[] | null,
): boolean {
  const roleOk = !item.minRole || (role !== null && orgRoleAtLeast(role, item.minRole));
  const permissionOk =
    !item.permission || (permissions !== null && permissions.includes(item.permission));
  return roleOk && permissionOk;
}

/** The items the given role + permission set may see. */
export function visibleNavItems(
  items: readonly NavItem[],
  role: OrgRole | null,
  permissions: readonly PermissionKey[] | null,
): readonly NavItem[] {
  return items.filter((item) => navItemAllowed(item, role, permissions));
}

/** Sidebar sections for the given role + permissions — sections left with no items are dropped. */
export function visibleNavSections(
  role: OrgRole | null,
  permissions: readonly PermissionKey[] | null,
): readonly NavSection[] {
  return sidebarNavSections
    .map((section) => ({ ...section, items: visibleNavItems(section.items, role, permissions) }))
    .filter((section) => section.items.length > 0);
}

const ALL_NAV_ITEMS: readonly NavItem[] = sidebarNavSections.flatMap((section) => section.items);

/** Every sidebar destination, flattened — palette + title resolution share it. */
export function allNavItems(): readonly NavItem[] {
  return ALL_NAV_ITEMS;
}

/** The active nav item's title for the given path — used by the mobile navbar chrome. */
export function resolveNavTitle(pathname: string): string | undefined {
  const activeHref = resolveActiveHref(pathname, ALL_NAV_ITEMS);
  if (!activeHref) return undefined;

  return ALL_NAV_ITEMS.find((item) => item.href === activeHref)?.title;
}
