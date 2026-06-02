import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RECORDING_FAILURE_CODES,
  resolveFailureFromError,
} from '@/modules/recordings/recovery/types/failure-codes';

/**
 * Behavior test for the upload-failure classifier used by the recovery flow.
 * It locks in how operators see failures so a refactor cannot silently change it.
 * The specific "quota exceeded" message now maps to QUOTA_EXCEEDED (it must be
 * checked before the broader size match).
 */
describe('resolveFailureFromError', () => {
  beforeEach(() => {
    // Default to "online" so message content drives classification, not connectivity.
    vi.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('classifies offline / network errors as NETWORK_DISCONNECTED', () => {
    expect(resolveFailureFromError(new Error('network request failed')).failureCode).toBe(
      RECORDING_FAILURE_CODES.NETWORK_DISCONNECTED,
    );
  });

  it('classifies a missing navigator.onLine as NETWORK_DISCONNECTED', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(resolveFailureFromError(new Error('whatever')).failureCode).toBe(
      RECORDING_FAILURE_CODES.NETWORK_DISCONNECTED,
    );
  });

  it('classifies timeout errors as UPLOAD_TIMEOUT', () => {
    expect(resolveFailureFromError(new Error('Request timed out')).failureCode).toBe(
      RECORDING_FAILURE_CODES.UPLOAD_TIMEOUT,
    );
  });

  it('classifies camera disconnect errors as CAMERA_DISCONNECTED', () => {
    expect(resolveFailureFromError(new Error('camera disconnected')).failureCode).toBe(
      RECORDING_FAILURE_CODES.CAMERA_DISCONNECTED,
    );
  });

  it('classifies a specific "quota exceeded" error as QUOTA_EXCEEDED', () => {
    expect(resolveFailureFromError(new Error('storage quota exceeded')).failureCode).toBe(
      RECORDING_FAILURE_CODES.QUOTA_EXCEEDED,
    );
  });

  it('classifies generic size errors as FILE_TOO_LARGE', () => {
    expect(resolveFailureFromError(new Error('file is too large')).failureCode).toBe(
      RECORDING_FAILURE_CODES.FILE_TOO_LARGE,
    );
    expect(resolveFailureFromError(new Error('disk quota warning')).failureCode).toBe(
      RECORDING_FAILURE_CODES.FILE_TOO_LARGE,
    );
  });

  it('classifies validation errors as VALIDATION_ERROR', () => {
    expect(
      resolveFailureFromError(new Error('Recording is not in a valid state.')).failureCode,
    ).toBe(RECORDING_FAILURE_CODES.VALIDATION_ERROR);
  });

  it('falls back to UNKNOWN_ERROR for unrecognized messages', () => {
    const result = resolveFailureFromError(new Error('something unexpected happened'));
    expect(result.failureCode).toBe(RECORDING_FAILURE_CODES.UNKNOWN_ERROR);
    expect(result.debugMessage).toBe('something unexpected happened');
  });

  it('stringifies non-Error inputs into debugMessage', () => {
    expect(resolveFailureFromError('plain string failure').debugMessage).toBe(
      'plain string failure',
    );
  });
});
