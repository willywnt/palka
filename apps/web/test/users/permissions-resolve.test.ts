import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PERMISSIONS,
  PERMISSION_KEYS,
  type PermissionKey,
} from '@/modules/users/permissions/catalog';
import { normalizeMatrix, resolvePermissions } from '@/modules/users/permissions/resolve';

/**
 * The permission resolver is the single source of truth shared by the server
 * guard (withApiRoute.requirePermission) and the client UI. These lock the
 * contract: OWNER is omnipotent, configurable roles fall back to the catalog
 * defaults, partial JSON merges with defaults, and unknown keys never leak.
 */
describe('resolvePermissions', () => {
  it('grants OWNER every catalog key, regardless of the stored matrix', () => {
    const set = resolvePermissions('OWNER', null);
    for (const key of PERMISSION_KEYS) {
      expect(set.has(key)).toBe(true);
    }
    expect(set.size).toBe(PERMISSION_KEYS.length);

    // Even an empty/over-restrictive matrix can't take a key from the OWNER.
    const restricted = resolvePermissions('OWNER', {
      ADMIN: Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false])),
      STAFF: Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false])),
    });
    expect(restricted.size).toBe(PERMISSION_KEYS.length);
  });

  it('falls back to DEFAULT_PERMISSIONS for ADMIN/STAFF when the matrix is null', () => {
    const admin = resolvePermissions('ADMIN', null);
    const staff = resolvePermissions('STAFF', null);

    // Defaults: ADMIN can do everything, STAFF nothing.
    for (const key of PERMISSION_KEYS) {
      expect(admin.has(key)).toBe(DEFAULT_PERMISSIONS.ADMIN[key]);
      expect(staff.has(key)).toBe(DEFAULT_PERMISSIONS.STAFF[key]);
    }
    expect(admin.size).toBe(PERMISSION_KEYS.length);
    expect(staff.size).toBe(0);
  });

  it('merges a partial stored matrix with the catalog defaults', () => {
    // STAFF is granted one key; every other key stays at its default (false).
    const grantedKey: PermissionKey = 'sales.refund';
    const staff = resolvePermissions('STAFF', {
      STAFF: { [grantedKey]: true },
    });

    expect(staff.has(grantedKey)).toBe(true);
    for (const key of PERMISSION_KEYS) {
      if (key === grantedKey) continue;
      expect(staff.has(key)).toBe(false);
    }
  });

  it('ignores a non-boolean stored value and uses the default instead', () => {
    const staff = resolvePermissions('STAFF', {
      // Garbage values must not flip a default on.
      STAFF: { 'sales.refund': 'yes', 'reports.view': 1 },
    });
    expect(staff.has('sales.refund')).toBe(false);
    expect(staff.has('reports.view')).toBe(false);
  });
});

describe('normalizeMatrix', () => {
  it('drops unknown keys and fills missing keys with defaults', () => {
    const normalized = normalizeMatrix({
      ADMIN: { 'reports.view': false, 'bogus.key': true },
      STAFF: { 'made.up': true },
    });

    // Unknown keys never appear on either role.
    expect(Object.keys(normalized.ADMIN)).toEqual([...PERMISSION_KEYS]);
    expect(Object.keys(normalized.STAFF)).toEqual([...PERMISSION_KEYS]);
    expect('bogus.key' in normalized.ADMIN).toBe(false);
    expect('made.up' in normalized.STAFF).toBe(false);

    // Explicit override is honored; the rest of ADMIN stays at default (true).
    expect(normalized.ADMIN['reports.view']).toBe(false);
    expect(normalized.ADMIN['sales.refund']).toBe(true);
    // STAFF had no real keys → all defaults (false).
    for (const key of PERMISSION_KEYS) {
      expect(normalized.STAFF[key]).toBe(false);
    }
  });

  it('returns the catalog defaults for a null/garbage input', () => {
    expect(normalizeMatrix(null)).toEqual(DEFAULT_PERMISSIONS);
    expect(normalizeMatrix('not-an-object')).toEqual(DEFAULT_PERMISSIONS);
  });
});
