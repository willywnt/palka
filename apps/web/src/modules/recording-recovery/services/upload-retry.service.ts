import { uploadFile } from '@/modules/storage/utils/upload-file';

import { ReliabilityError } from '../errors/reliability-errors';
import { recordingRecoveryService } from './recording-recovery.service';
import { isBrowserOnline } from '../utils/network';

export type UploadRetryCallbacks = {
  markUploading?: (recordingId: string) => Promise<unknown>;
  saveMetadata: (payload: {
    recordingId: string;
    noResi: string;
    storageKey: string;
    publicUrl: string;
    fileSizeBytes: number;
    durationSeconds: number;
    mimeType: string;
  }) => Promise<{ id: string }>;
  onProgress?: (percent: number) => void;
};

export async function retryTemporaryRecordingUpload(
  temporaryId: string,
  callbacks: UploadRetryCallbacks,
): Promise<void> {
  if (!isBrowserOnline()) {
    throw ReliabilityError.uploadRetryFailed(
      'You are offline. Connect to the internet and try again.',
    );
  }

  const record = await recordingRecoveryService.getTemporaryRecordingWithBlob(temporaryId);

  if (!record) {
    throw ReliabilityError.failedRecovery('Temporary recording not found.');
  }

  await recordingRecoveryService.updateUploadStatus(temporaryId, 'UPLOADING');

  try {
    const file = new File([record.blob], `recording-${Date.now()}.webm`, { type: record.mimeType });

    const recordingId = record.recordingId;

    if (!recordingId) {
      throw ReliabilityError.uploadRetryFailed(
        'This local recording is missing a server session. Discard it and record again.',
      );
    }

    if (callbacks.markUploading) {
      try {
        await callbacks.markUploading(recordingId);
      } catch {
        // Server may already be UPLOADING — continue with fresh presigned URL.
      }
    }

    const uploadResult = await uploadFile({
      file,
      onProgress: ({ percent }) => callbacks.onProgress?.(percent),
    });

    await callbacks.saveMetadata({
      recordingId,
      noResi: record.noResi,
      storageKey: uploadResult.storageKey,
      publicUrl: uploadResult.publicUrl,
      fileSizeBytes: file.size,
      durationSeconds: record.durationSeconds,
      mimeType: record.mimeType,
    });

    await recordingRecoveryService.updateUploadStatus(temporaryId, 'COMPLETED');
    await recordingRecoveryService.deleteTemporaryRecording(temporaryId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload retry failed';
    await recordingRecoveryService.updateUploadStatus(temporaryId, 'FAILED', message);
    throw ReliabilityError.uploadRetryFailed(message);
  }
}
