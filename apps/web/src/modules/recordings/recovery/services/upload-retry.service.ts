import { uploadFile } from '@/modules/storage/utils/upload-file';

import { ReliabilityError } from '../errors/reliability-errors';
import { recordingRecoveryService } from './recording-recovery.service';
import { isBrowserOnline } from '../utils/network';
import { createTimelineEvent, RECORDING_TIMELINE_EVENT_TYPES } from '../types/recording-timeline';
import {
  RECORDING_FAILURE_CODES,
  resolveFailureFromCode,
  resolveFailureFromError,
} from '../types/failure-codes';

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

  const preservedCameraDisconnect =
    record.failureCode === RECORDING_FAILURE_CODES.CAMERA_DISCONNECTED ||
    record.timeline.some(
      (event) => event.type === RECORDING_TIMELINE_EVENT_TYPES.CAMERA_DISCONNECTED,
    );

  await recordingRecoveryService.updateUploadStatus(temporaryId, 'UPLOADING', {
    failureCode: preservedCameraDisconnect ? record.failureCode : null,
    failureMessage: preservedCameraDisconnect ? record.failureMessage : null,
    failureReason: preservedCameraDisconnect ? record.failureReason : null,
    timelineEvent: createTimelineEvent(
      RECORDING_TIMELINE_EVENT_TYPES.UPLOAD_RESUMED,
      'Upload retry started.',
    ),
  });

  try {
    const file = new File([record.blob], `recording-${Date.now()}.webm`, { type: record.mimeType });

    const recordingId = record.recordingId;

    if (!recordingId) {
      throw ReliabilityError.uploadRetryFailed(
        'This local recording is missing a server session. Discard it and record again.',
      );
    }

    if (callbacks.markUploading) {
      await callbacks.markUploading(recordingId);
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

    await recordingRecoveryService.appendTimelineEvent(
      temporaryId,
      createTimelineEvent(
        RECORDING_TIMELINE_EVENT_TYPES.UPLOAD_COMPLETED,
        'Upload completed successfully.',
      ),
    );

    await recordingRecoveryService.updateUploadStatus(temporaryId, 'COMPLETED');
    await recordingRecoveryService.deleteTemporaryRecording(temporaryId);
  } catch (error) {
    const preservedCameraDisconnect =
      record.failureCode === RECORDING_FAILURE_CODES.CAMERA_DISCONNECTED ||
      record.timeline.some(
        (event) => event.type === RECORDING_TIMELINE_EVENT_TYPES.CAMERA_DISCONNECTED,
      );

    const failure = preservedCameraDisconnect
      ? {
          failureCode: RECORDING_FAILURE_CODES.CAMERA_DISCONNECTED,
          failureMessage: resolveFailureFromCode(RECORDING_FAILURE_CODES.CAMERA_DISCONNECTED),
          debugMessage: record.failureReason ?? 'Camera disconnected during recording',
        }
      : resolveFailureFromError(error);

    await recordingRecoveryService.updateUploadStatus(temporaryId, 'FAILED', {
      failureCode: failure.failureCode,
      failureMessage: failure.failureMessage,
      failureReason: failure.debugMessage,
      incrementRetryCount: true,
      timelineEvent: createTimelineEvent(
        RECORDING_TIMELINE_EVENT_TYPES.UPLOAD_FAILED,
        failure.failureMessage,
      ),
    });
    throw ReliabilityError.uploadRetryFailed(failure.failureMessage);
  }
}
