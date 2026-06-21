import { describe, expect, it } from 'vitest';

import {
  RETENTION_WARNING_WINDOW_DAYS,
  recordingRetentionDaysLeft,
} from '@/modules/recordings/utils/retention';

/**
 * recordingRetentionDaysLeft counts the days until the cleanup worker would
 * auto-delete a COMPLETED recording (uploadedAt + RECORDING_RETENTION_DAYS = 30).
 * Pure — a fixed `now` is passed so the assertions are deterministic.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-06-21T00:00:00.000Z').getTime();
const uploadedDaysAgo = (days: number) => new Date(NOW - days * DAY_MS).toISOString();

describe('recordingRetentionDaysLeft', () => {
  it('counts down from the 30-day window for a COMPLETED recording', () => {
    expect(
      recordingRetentionDaysLeft({ status: 'COMPLETED', uploadedAt: uploadedDaysAgo(25) }, NOW),
    ).toBe(5);
  });

  it('is 0 exactly at the cutoff', () => {
    expect(
      recordingRetentionDaysLeft({ status: 'COMPLETED', uploadedAt: uploadedDaysAgo(30) }, NOW),
    ).toBe(0);
  });

  it('goes negative once past the cutoff (next cleanup run removes it)', () => {
    expect(
      recordingRetentionDaysLeft({ status: 'COMPLETED', uploadedAt: uploadedDaysAgo(33) }, NOW),
    ).toBe(-3);
  });

  it('returns null for a non-COMPLETED recording (only completed ones are billed/cleaned)', () => {
    expect(
      recordingRetentionDaysLeft({ status: 'FAILED', uploadedAt: uploadedDaysAgo(25) }, NOW),
    ).toBeNull();
    expect(
      recordingRetentionDaysLeft(
        { status: 'PENDING_DELETE', uploadedAt: uploadedDaysAgo(40) },
        NOW,
      ),
    ).toBeNull();
  });

  it('returns null when uploadedAt is missing', () => {
    expect(recordingRetentionDaysLeft({ status: 'COMPLETED', uploadedAt: null }, NOW)).toBeNull();
  });

  it('only surfaces in the final week', () => {
    expect(RETENTION_WARNING_WINDOW_DAYS).toBe(7);
  });
});
