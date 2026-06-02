export function formatRecoveryFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatRecoveryDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export {
  formatOperationalDateTime,
  formatTimelineDateTime,
  formatOperationalDateShort,
} from '@/modules/recordings/utils/datetime';
export { formatOperationalDateTime as formatRecoveryDate } from '@/modules/recordings/utils/datetime';
export { formatTimelineDateTime as formatRecoveryTimelineDate } from '@/modules/recordings/utils/datetime';
