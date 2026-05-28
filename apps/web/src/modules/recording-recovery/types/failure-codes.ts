export const RECORDING_FAILURE_CODES = {
  NETWORK_DISCONNECTED: 'NETWORK_DISCONNECTED',
  UPLOAD_TIMEOUT: 'UPLOAD_TIMEOUT',
  CAMERA_DISCONNECTED: 'CAMERA_DISCONNECTED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UPLOAD_CANCELLED: 'UPLOAD_CANCELLED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type RecordingFailureCode =
  (typeof RECORDING_FAILURE_CODES)[keyof typeof RECORDING_FAILURE_CODES];

export const CAMERA_DISCONNECTED_OPERATOR_MESSAGE = 'Camera disconnected.';

export function isCameraDisconnectFailure(
  failureCode?: string | null,
  failureReason?: string | null,
  failureMessage?: string | null,
): boolean {
  if (failureCode === RECORDING_FAILURE_CODES.CAMERA_DISCONNECTED) {
    return true;
  }

  for (const value of [failureReason, failureMessage]) {
    if (!value) continue;
    const lower = value.toLowerCase();
    if (lower.includes('camera') && lower.includes('disconnect')) {
      return true;
    }
  }

  return false;
}

export function resolveFailureFromError(error: unknown): {
  failureCode: RecordingFailureCode;
  failureMessage: string;
  debugMessage: string;
} {
  const debugMessage = error instanceof Error ? error.message : String(error);
  const lower = debugMessage.toLowerCase();

  if (!navigator.onLine || lower.includes('offline') || lower.includes('network')) {
    return {
      failureCode: RECORDING_FAILURE_CODES.NETWORK_DISCONNECTED,
      failureMessage: 'Upload interrupted. You can safely retry when you are back online.',
      debugMessage,
    };
  }

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return {
      failureCode: RECORDING_FAILURE_CODES.UPLOAD_TIMEOUT,
      failureMessage: 'Upload timed out. You can safely retry upload.',
      debugMessage,
    };
  }

  if (lower.includes('camera') || lower.includes('disconnected')) {
    return {
      failureCode: RECORDING_FAILURE_CODES.CAMERA_DISCONNECTED,
      failureMessage: CAMERA_DISCONNECTED_OPERATOR_MESSAGE,
      debugMessage,
    };
  }

  if (lower.includes('quota') || lower.includes('too large') || lower.includes('file size')) {
    return {
      failureCode: RECORDING_FAILURE_CODES.FILE_TOO_LARGE,
      failureMessage: 'Recording exceeds the allowed size. Contact your administrator.',
      debugMessage,
    };
  }

  if (lower.includes('valid state') || lower.includes('validation')) {
    return {
      failureCode: RECORDING_FAILURE_CODES.VALIDATION_ERROR,
      failureMessage: debugMessage,
      debugMessage,
    };
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return {
      failureCode: RECORDING_FAILURE_CODES.UPLOAD_CANCELLED,
      failureMessage: 'Upload was cancelled.',
      debugMessage,
    };
  }

  if (lower.includes('quota exceeded')) {
    return {
      failureCode: RECORDING_FAILURE_CODES.QUOTA_EXCEEDED,
      failureMessage: 'Storage quota exceeded. Free up space, then retry from pending uploads.',
      debugMessage,
    };
  }

  return {
    failureCode: RECORDING_FAILURE_CODES.UNKNOWN_ERROR,
    failureMessage: 'Upload interrupted. You can safely retry upload.',
    debugMessage,
  };
}

export function resolveFailureFromCode(
  code: RecordingFailureCode,
  debugMessage?: string | null,
): string {
  switch (code) {
    case RECORDING_FAILURE_CODES.NETWORK_DISCONNECTED:
      return 'Upload interrupted. You can safely retry when you are back online.';
    case RECORDING_FAILURE_CODES.UPLOAD_TIMEOUT:
      return 'Upload timed out. You can safely retry upload.';
    case RECORDING_FAILURE_CODES.CAMERA_DISCONNECTED:
      return CAMERA_DISCONNECTED_OPERATOR_MESSAGE;
    case RECORDING_FAILURE_CODES.FILE_TOO_LARGE:
      return 'Recording exceeds the allowed size.';
    case RECORDING_FAILURE_CODES.UPLOAD_CANCELLED:
      return 'Upload was cancelled.';
    case RECORDING_FAILURE_CODES.QUOTA_EXCEEDED:
      return 'Storage quota exceeded.';
    case RECORDING_FAILURE_CODES.VALIDATION_ERROR:
      return debugMessage ?? 'Recording data is invalid.';
    default:
      return 'Upload interrupted. You can safely retry upload.';
  }
}

function isCameraDisconnectReason(value: string | null | undefined): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return lower.includes('camera') && lower.includes('disconnect');
}

/** Operator-facing failure text for a local pending recording. */
export function resolvePendingRecordingFailureMessage(recording: {
  failureMessage?: string | null;
  failureCode?: RecordingFailureCode | string | null;
  failureReason?: string | null;
  timeline?: Array<{ type: string }>;
}): string | null {
  if (
    isCameraDisconnectFailure(
      recording.failureCode,
      recording.failureReason,
      recording.failureMessage,
    ) ||
    recording.timeline?.some((event) => event.type === 'CAMERA_DISCONNECTED')
  ) {
    return CAMERA_DISCONNECTED_OPERATOR_MESSAGE;
  }

  if (recording.failureMessage) {
    return recording.failureMessage;
  }

  if (
    recording.failureCode &&
    Object.values(RECORDING_FAILURE_CODES).includes(recording.failureCode as RecordingFailureCode)
  ) {
    return resolveFailureFromCode(
      recording.failureCode as RecordingFailureCode,
      recording.failureReason,
    );
  }

  return null;
}
