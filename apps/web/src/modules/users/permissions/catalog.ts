import type { OrgRole } from '@prisma/client';

/*
 * The configurable permission catalog. Each key gates a set of routes/actions;
 * an organization's OWNER turns keys on/off per role (ADMIN, STAFF) from the
 * "Peran & akses" dashboard. OWNER always has every permission (never stored).
 * Defaults reproduce the original hardcoded behavior (ADMIN all, STAFF none),
 * so an org with no overrides behaves exactly as before this feature.
 */

export const PERMISSION_KEYS = [
  'reports.view',
  'sales.refund',
  'purchasing.cancel',
  'catalog.delete',
  'inventory.adjust',
  'opname.post',
  'marketplace.manage',
  'team.manage',
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
