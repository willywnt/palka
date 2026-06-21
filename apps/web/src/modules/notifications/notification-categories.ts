import type { NotificationCategory } from '@prisma/client';

import type { PermissionKey } from '@/modules/users/permissions/catalog';

/** A notification category with its Indonesian label + the permission that gates it. */
type NotificationCategoryMeta = {
  category: NotificationCategory;
  label: string;
  description: string;
  /** VIEW permission required to receive this category — null = everyone. Mirrors RBAC tray hiding. */
  requires: PermissionKey | null;
};

/**
 * The user-facing notification categories, in display order. Used by the preferences
 * UI (labels) and the preference service (the canonical category list). `requires`
 * keeps the Settings matrix in step with the RBAC tray hiding (a member who can't see
 * a section shouldn't be offered a toggle for its notifications).
 */
export const NOTIFICATION_CATEGORIES: readonly NotificationCategoryMeta[] = [
  {
    category: 'INVENTORY',
    label: 'Inventaris',
    description: 'Stok menipis, oversold, perlu restok, opname diposting, stok mati.',
    requires: null,
  },
  {
    category: 'ORDERS',
    label: 'Pesanan',
    description: 'Pesanan masuk, dikirim, dan yang perlu dikirim.',
    requires: null,
  },
  {
    category: 'SALES',
    label: 'Penjualan',
    description: 'Refund kasir dan penjualan di bawah modal.',
    requires: null,
  },
  {
    category: 'RETURNS',
    label: 'Retur',
    description: 'Retur dibuka dan diproses.',
    requires: null,
  },
  {
    category: 'PURCHASING',
    label: 'Pembelian',
    description: 'Barang pesanan pembelian (PO) diterima.',
    requires: 'purchasing.view',
  },
  {
    category: 'MARKETPLACE',
    label: 'Marketplace',
    description: 'Sinkronisasi gagal, token kedaluwarsa, channel bermasalah.',
    requires: 'marketplace.view',
  },
  {
    category: 'TEAM',
    label: 'Tim',
    description: 'Anggota tim baru bergabung.',
    requires: null,
  },
  {
    category: 'SYSTEM',
    label: 'Sistem',
    description: 'Pemberitahuan sistem.',
    requires: null,
  },
];
