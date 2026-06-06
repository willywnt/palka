import { describe, expect, it } from 'vitest';

import { isShareLinkActive, resolveShareLinkStatus } from '@/modules/recordings/utils/share-link';

const now = new Date('2026-06-07T12:00:00.000Z');
const future = new Date('2026-06-14T12:00:00.000Z');
const past = new Date('2026-06-01T12:00:00.000Z');

describe('resolveShareLinkStatus', () => {
  it('is active when not revoked and not yet expired', () => {
    expect(resolveShareLinkStatus({ revokedAt: null, expiresAt: future }, now)).toBe('active');
  });

  it('is expired once past the expiry', () => {
    expect(resolveShareLinkStatus({ revokedAt: null, expiresAt: past }, now)).toBe('expired');
  });

  it('is revoked even if not yet expired (revoked takes precedence)', () => {
    expect(resolveShareLinkStatus({ revokedAt: now, expiresAt: future }, now)).toBe('revoked');
  });

  it('treats the exact expiry instant as expired', () => {
    expect(resolveShareLinkStatus({ revokedAt: null, expiresAt: now }, now)).toBe('expired');
  });
});

describe('isShareLinkActive', () => {
  it('mirrors the active status', () => {
    expect(isShareLinkActive({ revokedAt: null, expiresAt: future }, now)).toBe(true);
    expect(isShareLinkActive({ revokedAt: null, expiresAt: past }, now)).toBe(false);
    expect(isShareLinkActive({ revokedAt: now, expiresAt: future }, now)).toBe(false);
  });
});
