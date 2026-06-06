import { describe, expect, it } from 'vitest';

import {
  generateProductImageKey,
  generateRecordingFilename,
  generateStorageKey,
  isPendingStorageKey,
  isUserStorageKey,
} from '@/modules/storage/utils/storage-key';
import { extractGeneratedFilename } from '@/modules/recordings/utils/media-recorder';

/**
 * Happy Flow #1 — upload ownership gate.
 * `completeRecording` rejects any storage key that is not a final object under
 * the caller's own `{userId}/` prefix, so this helper is a security boundary.
 */
describe('isUserStorageKey', () => {
  it('accepts a key under the user prefix', () => {
    expect(isUserStorageKey('user-1/2026/06/rec_20260602_abcd1234.webm', 'user-1')).toBe(true);
    expect(isUserStorageKey('user-1/img_20260606_abcd1234.webp', 'user-1')).toBe(true);
  });

  it('rejects a key belonging to another user', () => {
    expect(isUserStorageKey('user-2/2026/06/rec.webm', 'user-1')).toBe(false);
  });

  it('rejects a pending key (not yet a final user key)', () => {
    expect(isUserStorageKey('pending/user-1/abcd1234', 'user-1')).toBe(false);
  });

  it('rejects a prefix-injection attempt', () => {
    expect(isUserStorageKey('user-12/rec.webm', 'user-1')).toBe(false);
  });
});

describe('isPendingStorageKey', () => {
  it('detects pending keys', () => {
    expect(isPendingStorageKey('pending/user-1/abcd')).toBe(true);
    expect(isPendingStorageKey('user-1/2026/06/rec.webm')).toBe(false);
  });
});

describe('extractGeneratedFilename', () => {
  it('returns the last path segment', () => {
    expect(extractGeneratedFilename('user-1/2026/06/rec_x.webm')).toBe('rec_x.webm');
  });

  it('returns the input when there is no slash', () => {
    expect(extractGeneratedFilename('rec_x.webm')).toBe('rec_x.webm');
  });
});

describe('generateStorageKey', () => {
  it('builds {userId}/{year}/{month}/{filename} with zero-padded month', () => {
    const date = new Date(Date.UTC(2026, 0, 9)); // January 2026
    expect(generateStorageKey('user-1', 'rec_x.webm', date)).toBe('user-1/2026/01/rec_x.webm');
  });
});

describe('generateProductImageKey', () => {
  it('builds a flat {userId}/{filename} key', () => {
    expect(generateProductImageKey('user-1', 'img_x.webp')).toBe('user-1/img_x.webp');
  });
});

describe('generateRecordingFilename', () => {
  it('produces a rec_<YYYYMMDD>_<id>.webm filename', () => {
    const date = new Date(Date.UTC(2026, 5, 2));
    expect(generateRecordingFilename(date)).toMatch(/^rec_20260602_[0-9a-zA-Z]+\.webm$/);
  });
});
