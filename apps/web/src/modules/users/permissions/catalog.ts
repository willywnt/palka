import type { OrgRole } from '@prisma/client';

/*
 * The configurable permission catalog. Each key gates a set of routes/actions;
 * an organization's OWNER turns keys on/off per role (ADMIN, STAFF) from the
 * "Peran & akses" dashboard. OWNER always has every permission (never stored).
 *
 * Two tiers:
 *  - VIEW keys (reports.view, purchasing.view, marketplace.view) gate a whole
 *    section — when off, its nav menu + pages + actions all disappear for that role.
 *  - ACTION keys gate a single button while the surrounding page stays visible.
 *
 * Defaults: ADMIN gets everything, STAFF gets nothing — so by default STAFF is a
 * pure daily-ops role (Kasir/Pesanan/Inventaris/Opname-count/Katalog/Rekam/Retur)
 * with no reports, purchasing, marketplace, or money/config actions. The OWNER
 * widens or narrows this per role from the matrix.
 */

export const PERMISSION_KEYS = [
  // View/section keys — hide the nav menu + page when off.
  'reports.view',
  'purchasing.view',
  'marketplace.view',
  'finance.view',
  // Action keys — hide the button; the page stays visible.
  'sales.refund',
  'purchasing.cancel',
  'catalog.delete',
  'catalog.import',
  'inventory.adjust',
  'opname.post',
  'marketplace.manage',
  'team.manage',
  'finance.manage',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/** Configurable roles (OWNER is implicitly all-permissions, never in the matrix). */
export type ConfigurableRole = Extract<OrgRole, 'ADMIN' | 'STAFF'>;

/** Per-configurable-role allow-map. The persisted shape of `Organization.permissions`. */
export type PermissionMatrix = Record<ConfigurableRole, Record<PermissionKey, boolean>>;

/** id-ID label + help text for the matrix UI. */
export const PERMISSION_META: Record<PermissionKey, { label: string; description: string }> = {
  'reports.view': {
    label: 'Lihat laporan & laba',
    description: 'Buka laporan laba/channel/nilai stok/stok mati, kartu profit, dan Tutup hari.',
  },
  'purchasing.view': {
    label: 'Akses pembelian (PO)',
    description:
      'Lihat menu Pembelian, buat PO, dan terima barang. Tanpa ini menunya disembunyikan.',
  },
  'marketplace.view': {
    label: 'Akses marketplace',
    description: 'Lihat menu Marketplace dan koneksi toko. Tanpa ini menunya disembunyikan.',
  },
  'finance.view': {
    label: 'Akses keuangan & laba bersih',
    description:
      'Lihat menu Pengeluaran dan laporan Laba bersih (Net P&L). Tanpa ini menunya disembunyikan.',
  },
  'sales.refund': {
    label: 'Refund & void penjualan',
    description: 'Kembalikan dana atau batalkan transaksi kasir.',
  },
  'purchasing.cancel': {
    label: 'Batalkan pembelian (PO)',
    description: 'Membatalkan purchase order yang belum diterima.',
  },
  'catalog.delete': {
    label: 'Hapus produk, varian, bundel',
    description: 'Mengarsipkan/menghapus item katalog.',
  },
  'catalog.import': {
    label: 'Impor produk massal',
    description: 'Buat/perbarui banyak produk sekaligus dari file CSV.',
  },
  'inventory.adjust': {
    label: 'Sesuaikan & write-off stok',
    description: 'Penyesuaian stok manual dan penghapusan stok rusak.',
  },
  'opname.post': {
    label: 'Posting opname',
    description: 'Memposting hasil opname (menulis selisih ke kartu stok). Menghitung tetap boleh.',
  },
  'marketplace.manage': {
    label: 'Kelola koneksi marketplace',
    description: 'Hubungkan/putuskan toko, impor listing, dan atur pemetaan/sinkron.',
  },
  'team.manage': {
    label: 'Kelola tim',
    description:
      'Lihat anggota dan buat/cabut undangan staf. Ubah peran & hapus anggota tetap milik pemilik.',
  },
  'finance.manage': {
    label: 'Kelola pengeluaran',
    description: 'Catat, ubah, dan hapus biaya operasional.',
  },
};

/** Original behavior: ADMIN may do everything, STAFF nothing (until the owner edits it). */
export const DEFAULT_PERMISSIONS: PermissionMatrix = {
  ADMIN: Object.fromEntries(PERMISSION_KEYS.map((key) => [key, true])) as Record<
    PermissionKey,
    boolean
  >,
  STAFF: Object.fromEntries(PERMISSION_KEYS.map((key) => [key, false])) as Record<
    PermissionKey,
    boolean
  >,
};
