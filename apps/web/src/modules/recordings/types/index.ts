import type { RecordingStatus as PrismaRecordingStatus } from '@prisma/client';

import type { RecordingStatusFilter } from '../validators/list-recordings';

export type RecordingLifecycleStatus =
  | 'IDLE'
  | 'REQUESTING_PERMISSION'
  | 'RECORDING'
  | 'STOPPING'
  | 'UPLOADING'
  | 'COMPLETED'
  | 'FAILED';

export type ActiveRecordingSession = {
  id: string;
  noResi: string;
  startedAt: string;
};

export type CompletedRecordingSummary = {
  id: string;
  noResi: string;
  publicUrl: string;
  storageKey: string;
  fileSizeBytes: number;
  durationSeconds: number;
};

export type RecordingDetail = {
  id: string;
  noResi: string;
  status: PrismaRecordingStatus;
  durationSeconds: number;
  fileSizeBytes: number;
  mimeType: string;
  publicUrl: string;
  storageProvider: string;
  generatedFilename: string;
  startedAt: string;
  stoppedAt: string | null;
  uploadedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecordingListItem = {
  id: string;
  noResi: string;
  status: PrismaRecordingStatus;
  durationSeconds: number;
  fileSizeBytes: number;
  mimeType: string;
  publicUrl: string;
  createdAt: string;
  uploadedAt: string | null;
};

export type PaginatedRecordingsResponse = {
  items: RecordingListItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

export type RecordingDownloadResponse = {
  downloadUrl: string;
  filename: string;
  mimeType: string;
  expiresAt: string;
};

export type RecordingPlaybackResponse = {
  playbackUrl: string;
  expiresAt: string;
  mimeType: string;
};

export type StartRecordingResponse = {
  recordingId: string;
  noResi: string;
  startedAt: string;
};

export type SaveRecordingMetadataPayload = {
  recordingId: string;
  noResi: string;
  storageKey: string;
  publicUrl: string;
  fileSizeBytes: number;
  durationSeconds: number;
  mimeType: string;
};

export type SaveRecordingMetadataResponse = {
  id: string;
  noResi: string;
  status: PrismaRecordingStatus;
  publicUrl: string;
  storageKey: string;
  fileSizeBytes: number;
  durationSeconds: number;
};

export const RECORDING_MODULE_CONFIG = {
  tabLockKey: 'olshop-recording-lock',
  tabLockChannel: 'olshop-recording-lock',
  tabLockStaleMs: 5 * 60 * 1000,
} as const;

export const RECORDING_STATUS_LABELS: Record<PrismaRecordingStatus, string> = {
  RECORDING: 'Recording',
  UPLOADING: 'Uploading',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  PENDING_DELETE: 'Pending deletion',
  DELETED: 'Deleted',
};

export const RECORDING_STATUS_FILTER_LABELS: Record<RecordingStatusFilter, string> = {
  ALL: 'All statuses',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  UPLOADING: 'Uploading',
  RECORDING: 'Recording',
};
