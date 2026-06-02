import { describe, expect, it } from 'vitest';

import { AppError, DomainError } from '@/lib/errors';
import { RecordingError } from '@/modules/recordings/errors/recording-errors';
import { PairingError } from '@/modules/scanner-pairing/errors/pairing-errors';
import { StorageError } from '@/modules/storage/errors/storage-errors';
import { MarketplaceError } from '@/modules/marketplace/errors/marketplace-errors';
import { ReliabilityError } from '@/modules/recordings/recovery/errors/reliability-errors';

/**
 * Locks the HTTP error contract after the DomainError dependency inversion:
 * handleApiError maps any DomainError generically from code + statusCode, so the
 * status codes the route layer emits now live entirely on the error classes.
 * These assertions pin the exact mappings that were previously hard-coded in
 * lib/api-response.ts.
 */
describe('DomainError hierarchy', () => {
  it('every feature error extends DomainError (so the shared handler catches it)', () => {
    expect(RecordingError.quotaExceeded()).toBeInstanceOf(DomainError);
    expect(PairingError.expired()).toBeInstanceOf(DomainError);
    expect(StorageError.invalidFile()).toBeInstanceOf(DomainError);
    expect(MarketplaceError.notFound()).toBeInstanceOf(DomainError);
    expect(ReliabilityError.staleSession()).toBeInstanceOf(DomainError);
    expect(AppError.validation('x')).toBeInstanceOf(DomainError);
  });

  it('RecordingError maps an active-recording conflict to 409 and the rest to 400', () => {
    expect(RecordingError.activeRecordingExists().statusCode).toBe(409);
    expect(RecordingError.validation('bad').statusCode).toBe(400);
    expect(RecordingError.quotaExceeded().statusCode).toBe(400);
  });

  it('PairingError keeps its per-factory status codes', () => {
    expect(PairingError.notFound().statusCode).toBe(404);
    expect(PairingError.forbidden().statusCode).toBe(403);
    expect(PairingError.expired().statusCode).toBe(400);
    expect(PairingError.duplicateScan().statusCode).toBe(400);
  });

  it('StorageError keeps its computed status codes', () => {
    expect(StorageError.unauthorized().statusCode).toBe(401);
    expect(StorageError.quotaExceeded().statusCode).toBe(403);
    expect(StorageError.invalidMimeType().statusCode).toBe(400);
  });

  it('MarketplaceError keeps its per-factory status codes', () => {
    expect(MarketplaceError.duplicateConnection().statusCode).toBe(409);
    expect(MarketplaceError.notFound().statusCode).toBe(404);
    expect(MarketplaceError.validation('x').statusCode).toBe(400);
    expect(MarketplaceError.encryption().statusCode).toBe(500);
  });

  it('ReliabilityError maps to 400', () => {
    expect(ReliabilityError.staleSession().statusCode).toBe(400);
  });

  it('AppError keeps its factory status codes', () => {
    expect(AppError.validation('x').statusCode).toBe(400);
    expect(AppError.unauthorized().statusCode).toBe(401);
    expect(AppError.forbidden().statusCode).toBe(403);
    expect(AppError.notFound().statusCode).toBe(404);
    expect(AppError.internal().statusCode).toBe(500);
  });

  it('preserves the narrow code type and message on subclasses', () => {
    const err = PairingError.notFound();
    expect(err.code).toBe('PAIRING_NOT_FOUND');
    expect(err.message).toContain('not found');
    expect(err.name).toBe('PairingError');
  });
});
