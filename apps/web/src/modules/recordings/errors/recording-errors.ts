export const RECORDING_ERROR_CODES = {
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  WEBCAM_UNAVAILABLE: 'WEBCAM_UNAVAILABLE',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  RECORDING_INTERRUPTED: 'RECORDING_INTERRUPTED',
  ACTIVE_RECORDING_EXISTS: 'ACTIVE_RECORDING_EXISTS',
  TAB_LOCK_CONFLICT: 'TAB_LOCK_CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNSUPPORTED_BROWSER: 'UNSUPPORTED_BROWSER',
  UNKNOWN: 'UNKNOWN',
} as const;

export type RecordingErrorCode = (typeof RECORDING_ERROR_CODES)[keyof typeof RECORDING_ERROR_CODES];

export const RECORDING_ERROR_MESSAGES: Record<RecordingErrorCode, string> = {
  PERMISSION_DENIED: 'Camera permission was denied. Allow access and try again.',
  WEBCAM_UNAVAILABLE: 'No webcam was found or it is unavailable.',
  UPLOAD_FAILED: 'Upload failed. Please try again.',
  QUOTA_EXCEEDED: 'Storage quota exceeded. Delete files or upgrade your plan.',
  RECORDING_INTERRUPTED: 'Recording was interrupted because the webcam disconnected.',
  ACTIVE_RECORDING_EXISTS: 'You already have an active recording in progress.',
  TAB_LOCK_CONFLICT: 'Recording is already active in another tab.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  UNSUPPORTED_BROWSER: 'Recording is not supported in this browser.',
  UNKNOWN: 'An unexpected recording error occurred.',
};

export class RecordingError extends Error {
  readonly code: RecordingErrorCode;

  constructor(code: RecordingErrorCode, message?: string) {
    super(message ?? RECORDING_ERROR_MESSAGES[code]);
    this.name = 'RecordingError';
    this.code = code;
  }

  static permissionDenied() {
    return new RecordingError(RECORDING_ERROR_CODES.PERMISSION_DENIED);
  }

  static webcamUnavailable(message?: string) {
    return new RecordingError(RECORDING_ERROR_CODES.WEBCAM_UNAVAILABLE, message);
  }

  static uploadFailed(message?: string) {
    return new RecordingError(RECORDING_ERROR_CODES.UPLOAD_FAILED, message);
  }

  static quotaExceeded() {
    return new RecordingError(RECORDING_ERROR_CODES.QUOTA_EXCEEDED);
  }

  static recordingInterrupted() {
    return new RecordingError(RECORDING_ERROR_CODES.RECORDING_INTERRUPTED);
  }

  static activeRecordingExists() {
    return new RecordingError(RECORDING_ERROR_CODES.ACTIVE_RECORDING_EXISTS);
  }

  static tabLockConflict() {
    return new RecordingError(RECORDING_ERROR_CODES.TAB_LOCK_CONFLICT);
  }

  static validation(message: string) {
    return new RecordingError(RECORDING_ERROR_CODES.VALIDATION_ERROR, message);
  }

  static unsupportedBrowser() {
    return new RecordingError(RECORDING_ERROR_CODES.UNSUPPORTED_BROWSER);
  }

  static fromUnknown(error: unknown): RecordingError {
    if (error instanceof RecordingError) return error;

    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError') return RecordingError.permissionDenied();
      if (error.name === 'NotFoundError') return RecordingError.webcamUnavailable();
    }

    if (error instanceof Error) {
      if (error.message.includes('quota') || error.message.includes('Quota')) {
        return RecordingError.quotaExceeded();
      }

      if (error.message.toLowerCase().includes('active recording')) {
        return RecordingError.activeRecordingExists();
      }

      return new RecordingError(RECORDING_ERROR_CODES.UNKNOWN, error.message);
    }

    return new RecordingError(RECORDING_ERROR_CODES.UNKNOWN);
  }
}
