import { describe, expect, it } from 'vitest';

import {
  connectPairingSchema,
  pairingCodeSchema,
  pairingIdSchema,
  submitBarcodeSchema,
} from '@/modules/scanner-pairing/validators/pairing';

const VALID_UUID = '11111111-2222-4333-8444-555555555555';

/** Happy Flow #2 — boundary validation for pairing/QR + barcode submission. */
describe('pairingIdSchema', () => {
  it('accepts a valid uuid', () => {
    expect(pairingIdSchema.safeParse(VALID_UUID).success).toBe(true);
  });

  it('rejects a non-uuid', () => {
    expect(pairingIdSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});

describe('pairingCodeSchema', () => {
  it('accepts a code of at least 16 characters', () => {
    expect(pairingCodeSchema.safeParse('abcdef0123456789').success).toBe(true);
  });

  it('trims before length validation', () => {
    const result = pairingCodeSchema.safeParse('  abcdef0123456789  ');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('abcdef0123456789');
    }
  });

  it('rejects a code shorter than 16 characters', () => {
    expect(pairingCodeSchema.safeParse('short').success).toBe(false);
  });
});

describe('connectPairingSchema', () => {
  it('accepts a pairingId with optional deviceInfo', () => {
    const result = connectPairingSchema.safeParse({
      pairingId: VALID_UUID,
      deviceInfo: { userAgent: 'jest', platform: 'test', language: 'en', screen: '1x1' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a pairingId with no deviceInfo', () => {
    expect(connectPairingSchema.safeParse({ pairingId: VALID_UUID }).success).toBe(true);
  });

  it('rejects a missing pairingId', () => {
    expect(connectPairingSchema.safeParse({}).success).toBe(false);
  });
});

describe('submitBarcodeSchema', () => {
  it('accepts a valid pairingId + barcode', () => {
    expect(
      submitBarcodeSchema.safeParse({ pairingId: VALID_UUID, barcode: 'JNE123' }).success,
    ).toBe(true);
  });

  it('rejects an invalid barcode (reuses the resi rules)', () => {
    expect(
      submitBarcodeSchema.safeParse({ pairingId: VALID_UUID, barcode: 'no spaces' }).success,
    ).toBe(false);
  });
});
