import { RECORDING_RETENTION_DAYS } from '@falka/config/limits';
import type { RecordingStatus } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Only surface the auto-delete countdown in the final stretch, to keep the list uncluttered. */
export const RETENTION_WARNING_WINDOW_DAYS = 7;

/**
 * Whole days until the cleanup worker auto-deletes a COMPLETED recording
 * (`uploadedAt` + RECORDING_RETENTION_DAYS). Returns null when retention doesn't
 * apply (the recording isn't COMPLETED, or has no `uploadedAt`); 0 or negative means
 * it's past the window and the next cleanup run will remove it. Pure — pass `now` in
 * tests. NOTE: the cleanup worker is dormant on Vercel, so this reflects the retention
 * POLICY (it becomes live once the worker runs, i.e. the VPS host).
 */
export function recordingRetentionDaysLeft(
  recording: { status: RecordingStatus; uploadedAt: string | null },
  now: number = Date.now(),
): number | null {
  if (recording.status !== 'COMPLETED' || !recording.uploadedAt) return null;
  const deleteAt = new Date(recording.uploadedAt).getTime() + RECORDING_RETENTION_DAYS * DAY_MS;
  return Math.ceil((deleteAt - now) / DAY_MS);
}
