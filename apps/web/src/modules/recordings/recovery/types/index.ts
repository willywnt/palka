import type { RecordingFailureCode } from './failure-codes';
import type { RecordingTimelineEvent } from './recording-timeline';

export type RecoveryUploadStatus = 'PENDING' | 'UPLOADING' | 'FAILED' | 'COMPLETED';

export type TemporaryRecording = {
  id: string;
  recordingId: string | null;
  noResi: string;
  mimeType: string;
  durationSeconds: number;
  estimatedSizeBytes: number;
  createdAt: string;
  uploadStatus: RecoveryUploadStatus;
  failureCode: RecordingFailureCode | null;
  failureMessage: string | null;
  /** Internal debug detail — not shown to operators by default. */
  failureReason: string | null;
  retryCount: number;
  timeline: RecordingTimelineEvent[];
};

export type SaveTemporaryRecordingInput = {
  blob: Blob;
  noResi: string;
  mimeType: string;
  durationSeconds: number;
  recordingId?: string | null;
  uploadStatus?: RecoveryUploadStatus;
  failureCode?: RecordingFailureCode | null;
  failureMessage?: string | null;
  failureReason?: string | null;
  timeline?: RecordingTimelineEvent[];
};

export const RECORDING_RECOVERY_CONFIG = {
  dbName: 'olshop-recording-recovery',
  dbVersion: 2,
  storeName: 'temporary_recordings',
  metadataStoreName: 'recovery_metadata',
  sessionLockHeartbeatMs: 5_000,
  sessionLockStaleMs: 15_000,
} as const;

export const RECOVERY_METADATA_KEYS = {
  recoveryModalDismissed: 'recovery_modal_dismissed',
} as const;

export type CameraDeviceOption = {
  deviceId: string;
  label: string;
};

export type { RecordingFailureCode } from './failure-codes';
export type { RecordingTimelineEvent, RecordingTimelineEventType } from './recording-timeline';
