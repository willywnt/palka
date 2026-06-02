/**
 * Future-ready extension points for recording reliability.
 *
 * Not implemented yet — documents intended architecture for:
 * - Chunk recording + resumable upload
 * - Background Sync API / Service Worker upload queue
 * - Dedicated upload queue workers (BullMQ, etc.)
 */

export type FutureUploadQueueItem = {
  temporaryRecordingId: string;
  recordingId: string;
  priority: number;
  attempts: number;
  nextRetryAt: string | null;
};

export type FutureChunkManifest = {
  recordingId: string;
  chunkCount: number;
  completedChunkIndexes: number[];
  totalBytes: number;
};

export type FutureReliabilityCapabilities = {
  indexedDbPersistence: true;
  offlineDetection: true;
  manualUploadRetry: true;
  sessionLockHeartbeat: true;
  multiTabProtection: true;
  webcamDisconnectHandling: true;
  /** Planned — not implemented */
  chunkRecording: false;
  resumableUpload: false;
  backgroundSync: false;
  serviceWorkerUploadQueue: false;
  uploadQueueWorkers: false;
};

export const FUTURE_RELIABILITY_CAPABILITIES: FutureReliabilityCapabilities = {
  indexedDbPersistence: true,
  offlineDetection: true,
  manualUploadRetry: true,
  sessionLockHeartbeat: true,
  multiTabProtection: true,
  webcamDisconnectHandling: true,
  chunkRecording: false,
  resumableUpload: false,
  backgroundSync: false,
  serviceWorkerUploadQueue: false,
  uploadQueueWorkers: false,
};
