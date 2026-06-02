import { type RecordingError } from '../errors/recording-errors';
import {
  isCameraDisconnectFailure,
  RECORDING_FAILURE_CODES,
  resolveFailureFromCode,
  type RecordingFailureCode,
} from '@/modules/recordings/recovery/types/failure-codes';

const FAILURE_CODES = new Set<string>(Object.values(RECORDING_FAILURE_CODES));

export function isRecordingFailureCode(value: string): value is RecordingFailureCode {
  return FAILURE_CODES.has(value);
}

export function mapRecordingErrorToFailureMetadata(error: RecordingError): {
  failureCode: RecordingFailureCode;
  failureReason: string;
} {
  switch (error.code) {
    case 'QUOTA_EXCEEDED':
      return {
        failureCode: RECORDING_FAILURE_CODES.QUOTA_EXCEEDED,
        failureReason: resolveFailureFromCode(RECORDING_FAILURE_CODES.QUOTA_EXCEEDED),
      };
    case 'RECORDING_INTERRUPTED':
      return {
        failureCode: RECORDING_FAILURE_CODES.CAMERA_DISCONNECTED,
        failureReason: resolveFailureFromCode(RECORDING_FAILURE_CODES.CAMERA_DISCONNECTED),
      };
    case 'VALIDATION_ERROR':
      return {
        failureCode: RECORDING_FAILURE_CODES.VALIDATION_ERROR,
        failureReason: error.message,
      };
    case 'UPLOAD_FAILED':
      return {
        failureCode: RECORDING_FAILURE_CODES.UNKNOWN_ERROR,
        failureReason: error.message,
      };
    default:
      break;
  }

  const lowerMessage = error.message.toLowerCase();

  if (lowerMessage.includes('cancel')) {
    return {
      failureCode: RECORDING_FAILURE_CODES.UPLOAD_CANCELLED,
      failureReason: resolveFailureFromCode(RECORDING_FAILURE_CODES.UPLOAD_CANCELLED),
    };
  }

  return {
    failureCode: RECORDING_FAILURE_CODES.UNKNOWN_ERROR,
    failureReason: error.message,
  };
}

export function getRecordingFailureDetail(
  failureCode: string | null | undefined,
  failureReason: string | null | undefined,
): string | null {
  if (!failureCode && !failureReason) return null;

  if (isCameraDisconnectFailure(failureCode, failureReason)) {
    return resolveFailureFromCode(RECORDING_FAILURE_CODES.CAMERA_DISCONNECTED);
  }

  if (failureCode && isRecordingFailureCode(failureCode)) {
    return resolveFailureFromCode(failureCode, failureReason);
  }

  return failureReason ?? null;
}
