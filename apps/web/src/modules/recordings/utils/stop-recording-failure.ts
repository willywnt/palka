import {
  RECORDING_FAILURE_CODES,
  resolveFailureFromCode,
  resolveFailureFromError,
} from '@/modules/recordings/recovery/types/failure-codes';
import { isRecoverableUploadError } from '@/modules/recordings/recovery/utils/network';

import { RecordingError } from '../errors/recording-errors';

/** Params handed to the recoverable-failure handler when an upload can be retried locally. */
export type RecoverableFailureParams = {
  blob: Blob;
  mimeType: string;
  recordingId: string;
  noResi: string;
  durationSeconds: number;
  message: string;
  errorCode: string;
  failureCode?: string;
  failureReason: string;
  notifyWebcamDisconnect?: boolean;
  resetSession?: boolean;
};

export type StopRecordingFailureContext = {
  recordingId: string;
  noResi: string;
  durationSeconds: number;
  /** The captured recording, if `stopRecording` produced a non-empty blob. */
  blob: Blob | null;
  mimeType: string;
};

/**
 * The recovery action `stopRecording` should take for a failed upload:
 * keep the recording locally for retry, or fail it outright.
 */
export type StopRecordingFailureAction =
  | { kind: 'recoverable'; params: RecoverableFailureParams }
  | { kind: 'fatal'; error: RecordingError };

/**
 * Pure classification of a `stopRecording` upload failure. An operator cancel,
 * a quota error, or a recoverable network error keep the captured blob for local
 * retry; anything else (or a missing blob) is fatal.
 */
export function classifyStopRecordingFailure(
  error: unknown,
  context: StopRecordingFailureContext,
): StopRecordingFailureAction {
  const { recordingId, noResi, durationSeconds, blob, mimeType } = context;
  const base = { blob: blob as Blob, mimeType, recordingId, noResi, durationSeconds };

  if (error instanceof DOMException && error.name === 'AbortError') {
    if (blob && blob.size > 0) {
      return {
        kind: 'recoverable',
        params: {
          ...base,
          blob,
          message: resolveFailureFromCode(RECORDING_FAILURE_CODES.UPLOAD_CANCELLED),
          errorCode: 'UPLOAD_CANCELLED',
          failureCode: RECORDING_FAILURE_CODES.UPLOAD_CANCELLED,
          failureReason: 'Upload cancelled by operator',
          resetSession: true,
        },
      };
    }
    return { kind: 'fatal', error: RecordingError.uploadFailed('Upload cancelled.') };
  }

  const message = error instanceof Error ? error.message : 'Upload failed';
  const recordingError =
    error instanceof RecordingError ? error : RecordingError.fromUnknown(error);

  if (recordingError.code === 'QUOTA_EXCEEDED' || message.toLowerCase().includes('quota')) {
    if (blob && blob.size > 0) {
      return {
        kind: 'recoverable',
        params: {
          ...base,
          blob,
          message: resolveFailureFromCode(RECORDING_FAILURE_CODES.QUOTA_EXCEEDED),
          errorCode: 'QUOTA_EXCEEDED',
          failureCode: RECORDING_FAILURE_CODES.QUOTA_EXCEEDED,
          failureReason: recordingError.message,
          resetSession: true,
        },
      };
    }
    return { kind: 'fatal', error: RecordingError.quotaExceeded() };
  }

  if (blob && blob.size > 0 && isRecoverableUploadError(error)) {
    const failure = resolveFailureFromError(error);
    return {
      kind: 'recoverable',
      params: {
        ...base,
        blob,
        message: failure.failureMessage,
        errorCode: 'UPLOAD_RECOVERABLE',
        failureCode: failure.failureCode,
        failureReason: failure.debugMessage,
      },
    };
  }

  return { kind: 'fatal', error: RecordingError.uploadFailed(message) };
}
