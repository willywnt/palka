import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearScanDebounce, isDuplicateScan } from '@/modules/scanner-pairing/utils/scan-debounce';
import { BARCODE_SCAN_DEBOUNCE_MS } from '@/modules/scanner-pairing/config';

/**
 * Happy Flow #2 — server-side de-duplication of rapid repeated scans.
 * Each test uses a unique session id so the module-level debounce map does not leak.
 */
describe('isDuplicateScan', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats the first scan of a barcode as not duplicate', () => {
    expect(isDuplicateScan('session-a', 'BARCODE1')).toBe(false);
  });

  it('treats an immediate identical re-scan as duplicate', () => {
    expect(isDuplicateScan('session-b', 'BARCODE1')).toBe(false);
    expect(isDuplicateScan('session-b', 'BARCODE1')).toBe(true);
  });

  it('does not treat a different barcode as duplicate', () => {
    expect(isDuplicateScan('session-c', 'BARCODE1')).toBe(false);
    expect(isDuplicateScan('session-c', 'BARCODE2')).toBe(false);
  });

  it('allows the same barcode again once the debounce window has elapsed', () => {
    expect(isDuplicateScan('session-d', 'BARCODE1')).toBe(false);
    vi.advanceTimersByTime(BARCODE_SCAN_DEBOUNCE_MS + 1);
    expect(isDuplicateScan('session-d', 'BARCODE1')).toBe(false);
  });

  it('isolates debounce state per session', () => {
    expect(isDuplicateScan('session-e', 'BARCODE1')).toBe(false);
    expect(isDuplicateScan('session-f', 'BARCODE1')).toBe(false);
  });

  it('clearScanDebounce resets a session so the next scan is fresh', () => {
    expect(isDuplicateScan('session-g', 'BARCODE1')).toBe(false);
    clearScanDebounce('session-g');
    expect(isDuplicateScan('session-g', 'BARCODE1')).toBe(false);
  });
});
