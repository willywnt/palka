import { describe, expect, it } from 'vitest';

import { noResiSchema, normalizeBarcodeValue } from '@/modules/recordings/validators/no-resi';

/**
 * Happy Flow #1 — manual recording input gate.
 * The resi/tracking number is the first guard before a recording can start.
 */
describe('noResiSchema', () => {
  it('accepts a typical alphanumeric tracking number', () => {
    const result = noResiSchema.safeParse('JNE0012345678');
    expect(result.success).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(noResiSchema.safeParse('').success).toBe(false);
  });

  it('rejects values shorter than 3 characters', () => {
    expect(noResiSchema.safeParse('12').success).toBe(false);
    expect(noResiSchema.safeParse('123').success).toBe(true);
  });

  it('rejects values longer than 64 characters', () => {
    expect(noResiSchema.safeParse('A'.repeat(65)).success).toBe(false);
    expect(noResiSchema.safeParse('A'.repeat(64)).success).toBe(true);
  });

  it('allows letters, numbers, dashes and underscores only', () => {
    expect(noResiSchema.safeParse('ABC-123_456').success).toBe(true);
    expect(noResiSchema.safeParse('has space').success).toBe(false);
    expect(noResiSchema.safeParse('has/slash').success).toBe(false);
    expect(noResiSchema.safeParse('emoji😀123').success).toBe(false);
  });

  it('trims surrounding whitespace before validating', () => {
    const result = noResiSchema.safeParse('  ABC123  ');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('ABC123');
    }
  });
});

describe('normalizeBarcodeValue', () => {
  it('strips all whitespace and uppercases', () => {
    expect(normalizeBarcodeValue('  jne 001 234  ')).toBe('JNE001234');
  });

  it('is idempotent for an already-normalized value', () => {
    expect(normalizeBarcodeValue('ABC123')).toBe('ABC123');
  });
});
