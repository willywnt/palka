import {
  STORAGE_QUOTA_CRITICAL_PERCENT,
  STORAGE_QUOTA_WARNING_PERCENT,
} from '@falka/config/limits';

export type StorageQuotaLevel = 'normal' | 'warning' | 'critical' | 'full';

export function getStorageQuotaLevel(usagePercent: number): StorageQuotaLevel {
  if (usagePercent >= 100) return 'full';
  if (usagePercent >= STORAGE_QUOTA_CRITICAL_PERCENT) return 'critical';
  if (usagePercent >= STORAGE_QUOTA_WARNING_PERCENT) return 'warning';
  return 'normal';
}

export function isStorageQuotaExceeded(quota: {
  remainingBytes: number;
  usagePercent: number;
}): boolean {
  return quota.remainingBytes <= 0 || quota.usagePercent >= 100;
}

export function getStorageQuotaWarningMessage(level: StorageQuotaLevel): string | null {
  switch (level) {
    case 'full':
      return 'Kuota penyimpanan penuh. Hapus file lama (rekaman/foto produk) atau hubungi admin kamu untuk menambah kuota.';
    case 'critical':
      return 'Penyimpanan hampir penuh. Hapus file lama supaya unggahan tidak gagal.';
    case 'warning':
      return 'Pemakaian penyimpanan mulai tinggi. Pertimbangkan hapus file lama untuk melegakan ruang.';
    default:
      return null;
  }
}

export function getStorageQuotaBarClassName(level: StorageQuotaLevel): string {
  switch (level) {
    case 'full':
    case 'critical':
      return 'bg-destructive';
    case 'warning':
      return 'bg-highlight';
    default:
      return 'bg-primary';
  }
}

export function getStorageQuotaContainerClassName(level: StorageQuotaLevel): string {
  switch (level) {
    case 'full':
    case 'critical':
      return 'border-destructive/40 bg-destructive/10';
    case 'warning':
      return 'border-highlight/40 bg-highlight/15';
    default:
      return 'border-border bg-muted/30';
  }
}
