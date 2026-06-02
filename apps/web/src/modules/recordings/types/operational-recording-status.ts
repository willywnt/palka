import type { RecordingStatus as PrismaRecordingStatus } from '@prisma/client';

import type { RecordingLifecycleStatus } from '../types';
import type { RecoveryUploadStatus } from '@/modules/recordings/recovery/types';

/** Unified operator-facing recording status. */
export const OPERATIONAL_RECORDING_STATUS = {
  IDLE: 'IDLE',
  RECORDING: 'RECORDING',
  PROCESSING: 'PROCESSING',
  PENDING_UPLOAD: 'PENDING_UPLOAD',
  UPLOADING: 'UPLOADING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type OperationalRecordingStatus =
  (typeof OPERATIONAL_RECORDING_STATUS)[keyof typeof OPERATIONAL_RECORDING_STATUS];

export const OPERATIONAL_STATUS_LABELS: Record<OperationalRecordingStatus, string> = {
  IDLE: 'Ready',
  RECORDING: 'Recording',
  PROCESSING: 'Processing',
  PENDING_UPLOAD: 'Pending',
  UPLOADING: 'Uploading',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};

export const OPERATIONAL_STATUS_VARIANTS: Record<
  OperationalRecordingStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  IDLE: 'secondary',
  RECORDING: 'destructive',
  PROCESSING: 'outline',
  PENDING_UPLOAD: 'outline',
  UPLOADING: 'default',
  COMPLETED: 'default',
  FAILED: 'destructive',
};

export function mapLifecycleToOperational(
  status: RecordingLifecycleStatus,
): OperationalRecordingStatus {
  switch (status) {
    case 'IDLE':
      return 'IDLE';
    case 'REQUESTING_PERMISSION':
    case 'STOPPING':
      return 'PROCESSING';
    case 'RECORDING':
      return 'RECORDING';
    case 'UPLOADING':
      return 'UPLOADING';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'FAILED':
      return 'FAILED';
    default:
      return 'IDLE';
  }
}

export function mapRecoveryUploadToOperational(
  uploadStatus: RecoveryUploadStatus,
): OperationalRecordingStatus {
  switch (uploadStatus) {
    case 'PENDING':
      return 'PENDING_UPLOAD';
    case 'UPLOADING':
      return 'UPLOADING';
    case 'FAILED':
      return 'FAILED';
    case 'COMPLETED':
      return 'COMPLETED';
    default:
      return 'PENDING_UPLOAD';
  }
}

export function mapServerStatusToOperational(
  status: PrismaRecordingStatus,
): OperationalRecordingStatus {
  switch (status) {
    case 'RECORDING':
      return 'RECORDING';
    case 'UPLOADING':
      return 'UPLOADING';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'FAILED':
    case 'PENDING_DELETE':
    case 'DELETED':
      return 'FAILED';
    default:
      return 'COMPLETED';
  }
}
