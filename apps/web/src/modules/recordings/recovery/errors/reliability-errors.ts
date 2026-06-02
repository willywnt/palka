import { DomainError } from '@/lib/errors';

export const RELIABILITY_ERROR_CODES = {
  STALE_SESSION: 'STALE_SESSION',
  FAILED_RECOVERY: 'FAILED_RECOVERY',
  INDEXED_DB_UNAVAILABLE: 'INDEXED_DB_UNAVAILABLE',
  UPLOAD_RETRY_FAILED: 'UPLOAD_RETRY_FAILED',
  RECONNECT_FAILED: 'RECONNECT_FAILED',
} as const;

export type ReliabilityErrorCode =
  (typeof RELIABILITY_ERROR_CODES)[keyof typeof RELIABILITY_ERROR_CODES];

export class ReliabilityError extends DomainError {
  declare readonly code: ReliabilityErrorCode;

  constructor(code: ReliabilityErrorCode, message: string) {
    super(code, message, 400);
    this.name = 'ReliabilityError';
  }

  static staleSession() {
    return new ReliabilityError(
      RELIABILITY_ERROR_CODES.STALE_SESSION,
      'A stale recording session was cleared. You can start a new recording.',
    );
  }

  static failedRecovery(message = 'Failed to recover recording from local storage.') {
    return new ReliabilityError(RELIABILITY_ERROR_CODES.FAILED_RECOVERY, message);
  }

  static indexedDbUnavailable() {
    return new ReliabilityError(
      RELIABILITY_ERROR_CODES.INDEXED_DB_UNAVAILABLE,
      'Local recording storage is unavailable in this browser.',
    );
  }

  static uploadRetryFailed(message = 'Upload retry failed.') {
    return new ReliabilityError(RELIABILITY_ERROR_CODES.UPLOAD_RETRY_FAILED, message);
  }

  static reconnectFailed() {
    return new ReliabilityError(
      RELIABILITY_ERROR_CODES.RECONNECT_FAILED,
      'Reconnection failed. Try again when your connection is stable.',
    );
  }
}
