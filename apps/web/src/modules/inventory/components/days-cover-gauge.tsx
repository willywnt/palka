import { cn } from '@/lib/utils';

import type { ReorderStatus } from '../types';

/** Inner-bar tone per reorder urgency — calm statuses share the ok tone. */
const STATUS_BAR_CLASS: Record<ReorderStatus, string> = {
  URGENT: 'bg-signed-down',
  SOON: 'bg-highlight',
  OK: 'bg-status-ok/60',
  DEAD: 'bg-status-ok/60',
  NO_DATA: 'bg-status-ok/60',
};

/**
 * Thin depletion bar showing how long the available stock lasts versus the
 * target cover. `daysOfCover === null` = no measurable demand (stock lasts
 * "forever"): the caption shows "—" over a full bar.
 */
export function DaysCoverGauge({
  daysOfCover,
  targetCoverDays,
  status,
  className,
}: {
  daysOfCover: number | null;
  targetCoverDays: number;
  status: ReorderStatus;
  className?: string;
}) {
  const days = daysOfCover === null ? null : Math.round(daysOfCover);
  const ratio =
    daysOfCover === null ? 1 : Math.min(1, Math.max(0, daysOfCover / Math.max(1, targetCoverDays)));
  const ariaLabel =
    days === null
      ? 'Belum ada data penjualan buat memperkirakan daya tahan stok ini.'
      : `Stok diperkirakan cukup untuk ${days} hari dari target ${targetCoverDays} hari.`;

  return (
    <div role="img" aria-label={ariaLabel} className={cn('w-24 space-y-1', className)}>
      <div className="text-xs">
        {days === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            <span className="num">±{days}</span> hari
          </>
        )}
      </div>
      <div aria-hidden className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
        <div
          className={cn('h-full rounded-full', STATUS_BAR_CLASS[status])}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
