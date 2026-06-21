'use client';

import { StatusBadge } from '@/components/status-badge';

import type { RecordingListItem } from '../types';
import { RETENTION_WARNING_WINDOW_DAYS, recordingRetentionDaysLeft } from '../utils/retention';

/**
 * "Auto-hapus ~Nh lagi" badge for a COMPLETED recording nearing its retention
 * cutoff. Shows only inside the final window (≤ RETENTION_WARNING_WINDOW_DAYS) so
 * the list stays clean; turns danger-toned in the last couple of days. Renders
 * nothing when retention doesn't apply yet.
 */
export function RecordingRetentionBadge({
  recording,
}: {
  recording: Pick<RecordingListItem, 'status' | 'uploadedAt'>;
}) {
  const daysLeft = recordingRetentionDaysLeft(recording);
  if (daysLeft === null || daysLeft > RETENTION_WARNING_WINDOW_DAYS) return null;

  const label =
    daysLeft <= 0
      ? 'Auto-hapus segera'
      : daysLeft === 1
        ? 'Auto-hapus besok'
        : `Auto-hapus ~${daysLeft}h lagi`;

  return <StatusBadge tone={daysLeft <= 2 ? 'danger' : 'warn'}>{label}</StatusBadge>;
}
