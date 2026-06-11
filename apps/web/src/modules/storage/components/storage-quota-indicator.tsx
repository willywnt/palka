'use client';

import Link from 'next/link';
import { AlertTriangle, HardDrive } from 'lucide-react';

import { formatStoragePercent, formatStorageUsage } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { useStorageQuotaQuery } from '../hooks/use-storage-quota';
import {
  getStorageQuotaBarClassName,
  getStorageQuotaContainerClassName,
  getStorageQuotaLevel,
  getStorageQuotaWarningMessage,
  type StorageQuotaLevel,
} from '../utils/quota-status';

function WarningText({ level, message }: { level: StorageQuotaLevel; message: string }) {
  return (
    <p
      className={`flex items-start gap-2 text-xs leading-snug ${
        level === 'warning' ? 'text-status-warn' : 'text-destructive'
      }`}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  );
}

/** Warning copy + a direct path to act on it (delete old recordings). */
function QuotaWarning({ level, message }: { level: StorageQuotaLevel; message: string }) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
      <WarningText level={level} message={message} />
      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard/recordings">Kelola rekaman</Link>
      </Button>
    </div>
  );
}

export function StorageQuotaIndicator({
  showIcon = true,
  className,
  variant = 'full',
}: {
  showIcon?: boolean;
  className?: string;
  variant?: 'full' | 'warning-only';
}) {
  const { data, isLoading, isError, refetch } = useStorageQuotaQuery();

  if (isLoading) {
    if (variant === 'warning-only') return null;

    return (
      <div className={`rounded-lg border px-4 py-3 ${className ?? ''}`}>
        <Skeleton className="mb-2 h-4 w-40" />
        <Skeleton className="mb-2 h-2 w-full" />
        <Skeleton className="h-3 w-28" />
      </div>
    );
  }

  if (isError || !data) {
    if (variant === 'warning-only') return null;

    return (
      <div
        className={`border-destructive/30 bg-destructive/5 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${className ?? ''}`}
      >
        <p className="text-destructive flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          Gagal memuat info penyimpanan.
        </p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Coba lagi
        </Button>
      </div>
    );
  }

  const level = getStorageQuotaLevel(data.usagePercent);
  const warningMessage = getStorageQuotaWarningMessage(level);

  if (variant === 'warning-only') {
    if (level === 'normal' || !warningMessage) return null;

    return (
      <div
        className={`rounded-lg border px-4 py-3 text-sm ${getStorageQuotaContainerClassName(level)} ${className ?? ''}`}
      >
        <p className="font-medium">
          Penyimpanan cloud{' '}
          <span className="num">
            {formatStoragePercent(data.usedBytes, data.quotaBytes)} terpakai
          </span>
          <span className="text-muted-foreground font-normal">
            {' '}
            · {formatStorageUsage(data.usedBytes, data.quotaBytes)} digunakan
          </span>
        </p>
        <QuotaWarning level={level} message={warningMessage} />
      </div>
    );
  }

  const safePercent = Math.max(0, Math.min(100, data.usagePercent));

  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${getStorageQuotaContainerClassName(level)} ${className ?? ''}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {showIcon ? <HardDrive className="text-muted-foreground size-4 shrink-0" /> : null}
          <span className="font-medium">Penyimpanan cloud</span>
        </div>
        <span className="num font-medium">
          {formatStoragePercent(data.usedBytes, data.quotaBytes)}
        </span>
      </div>

      <div className="bg-muted/80 mt-3 h-2 overflow-hidden rounded-full">
        <div
          className={`h-full transition-all duration-200 ${getStorageQuotaBarClassName(level)}`}
          style={{ width: `${safePercent}%` }}
        />
      </div>

      <p className="text-muted-foreground num mt-2 text-xs">
        {formatStorageUsage(data.usedBytes, data.quotaBytes)} digunakan
      </p>

      {data.quotaBytes === 0 ? (
        <p className="text-muted-foreground mt-2 text-xs">
          Kuota penyimpanan belum diatur — hubungi admin kamu untuk mengaktifkan upload.
        </p>
      ) : null}

      {warningMessage ? <QuotaWarning level={level} message={warningMessage} /> : null}
    </div>
  );
}
