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
  failureReason: string | null;
};

export type SaveTemporaryRecordingInput = {
  blob: Blob;
  noResi: string;
  mimeType: string;
  durationSeconds: number;
  recordingId?: string | null;
  uploadStatus?: RecoveryUploadStatus;
  failureReason?: string | null;
};

export const RECORDING_RECOVERY_CONFIG = {
  dbName: 'olshop-recording-recovery',
  dbVersion: 1,
  storeName: 'temporary_recordings',
  sessionLockHeartbeatMs: 5_000,
  sessionLockStaleMs: 15_000,
} as const;

export type CameraDeviceOption = {
  deviceId: string;
  label: string;
};
