import { formatBytes, formatDate, formatDuration } from '@olshop/utils/date';

export { formatDate, formatDuration, formatBytes as formatFileSize };

const STABLE_DATETIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return STABLE_DATETIME_FORMAT.format(date);
}

export function formatStorageUsage(usedBytes: number, quotaBytes: number): string {
  return `${formatBytes(usedBytes)} / ${formatBytes(quotaBytes)}`;
}

export function formatStoragePercent(usedBytes: number, quotaBytes: number): string {
  if (quotaBytes === 0) return '100%';
  return `${Math.min(100, Math.round((usedBytes / quotaBytes) * 100))}%`;
}

const IDR_FORMAT = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

/** Formats a Decimal-as-string (or number) as Indonesian Rupiah. */
export function formatCurrency(value: string | number): string {
  const amount = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(amount)) return '—';
  return IDR_FORMAT.format(amount);
}
