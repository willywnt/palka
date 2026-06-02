import { describe, expect, it } from 'vitest';

import {
  generateRecordingFilename,
  generateStorageKey,
  isPendingStorageKey,
} from '@/modules/storage/utils/storage-key';
import {
  extractGeneratedFilename,
  isUserStorageKey,
} from '@/modules/recordings/utils/media-recorder';

/**
 * Happy Flow #1 — upload ownership gate.
 * `completeRecording` rejects any storage key that is not under the caller's own
 * `recordings/{userId}/` prefix, so these helpers are a security-relevant boundary.
 */
describe('isUserStorageKey', () => {
  it('accepts a key under the user prefix', () => {
    expect(isUserStorageKey('recordings/user-1/2026/06/rec_20260602_abcd1234.webm', 'user-1')).toBe(
      true,
    );
  });

  it('rejects a key belonging to another user', () => {
    expect(isUserStorageKey('recordings/user-2/2026/06/rec.webm', 'user-1')).toBe(false);
  });

  it('rejects a pending key (not yet a final user key)', () => {
    expect(isUserStorageKey('pending/user-1/abcd1234', 'user-1')).toBe(false);
  });

  it('rejects a prefix-injection attempt', () => {
    expect(isUserStorageKey('recordings/user-12/rec.webm', 'user-1')).toBe(false);
  });
});

describe('isPendingStorageKey', () => {
  it('detects pending keys', () => {
    expect(isPendingStorageKey('pending/user-1/abcd')).toBe(true);
    expect(isPendingStorageKey('recordings/user-1/2026/06/rec.webm')).toBe(false);
  });
});

describe('extractGeneratedFilename', () => {
  it('returns the last path segment', () => {
    expect(extractGeneratedFilename('recordings/user-1/2026/06/rec_x.webm')).toBe('rec_x.webm');
  });

  it('returns the input when there is no slash', () => {
    expect(extractGeneratedFilename('rec_x.webm')).toBe('rec_x.webm');
  });
});

describe('generateStorageKey', () => {
  it('builds recordings/{userId}/{year}/{month}/{filename} with zero-padded month', () => {
    const date = new Date(Date.UTC(2026, 0, 9)); // January 2026
    expect(generateStorageKey('user-1', 'rec_x.webm', date)).toBe(
      'recordings/user-1/2026/01/rec_x.webm',
    );
  });
});

describe('generateRecordingFilename', () => {
  it('produces a rec_<YYYYMMDD>_<id>.webm filename', () => {
    const date = new Date(Date.UTC(2026, 5, 2));
    expect(generateRecordingFilename(date)).toMatch(/^rec_20260602_[0-9a-zA-Z]+\.webm$/);
  });
});
