import type { RecordingStatus } from '@prisma/client';

import { formatEstimatedFileSize, formatRecordingDuration } from './format';

export { formatRecordingDuration, formatEstimatedFileSize as formatRecordingFileSize };

export function formatRecordingDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatRecordingDateShort(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function getRecordingStatusVariant(
  status: RecordingStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'COMPLETED':
      return 'default';
    case 'UPLOADING':
    case 'RECORDING':
      return 'outline';
    case 'FAILED':
    case 'DELETED':
    case 'PENDING_DELETE':
      return 'destructive';
    default:
      return 'secondary';
  }
}

export function getStorageProviderLabel(provider: string): string {
  if (provider === 'cloudflare-r2') return 'Cloudflare R2';
  return provider;
}

export function isPlayableRecording(status: RecordingStatus, publicUrl: string): boolean {
  return status === 'COMPLETED' && Boolean(publicUrl) && publicUrl !== 'pending';
}
