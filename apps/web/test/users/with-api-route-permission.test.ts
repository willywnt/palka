import { describe, expect, expectTypeOf, it } from 'vitest';

import type { ApiRouteOptions } from '@/lib/api/with-api-route';
import { PERMISSION_KEYS, type PermissionKey } from '@/modules/users/permissions/catalog';
import { updatePermissionsSchema } from '@/modules/users/validators/org';

/**
 * The `withApiRoute` gating itself needs the full request stack (auth + Prisma
 * org-context) to run, so instead of mocking all of that we lock the two pieces
 * that actually encode the configurable-RBAC contract:
 *   1. the `requirePermission` option only accepts a real PermissionKey, and
 *   2. the permission-matrix validator only accepts the catalog's keys.
 */
describe('withApiRoute requirePermission option type', () => {
  it('accepts a PermissionKey alongside the requireAuth/requireAdmin XOR', () => {
    // These compile only if `requirePermission` is typed as `PermissionKey?`
    // and combines with the auth/admin discriminated union.
    const authOption = {
      requireAuth: true,
      requirePermission: 'reports.view',
    } satisfies ApiRouteOptions;
    const adminOption = {
      requireAdmin: true,
      requirePermission: 'team.manage',
    } satisfies ApiRouteOptions;

    expect(authOption.requirePermission).toBe('reports.view');
    expect(adminOption.requirePermission).toBe('team.manage');

    expectTypeOf<ApiRouteOptions['requirePermission']>().toEqualTypeOf<PermissionKey | undefined>();
  });
});

describe('updatePermissionsSchema', () => {
  const fullRole = () =>
    Object.fromEntries(PERMISSION_KEYS.map((key) => [key, false])) as Record<
      PermissionKey,
      boolean
    >;

  it('accepts a complete matrix for both configurable roles', () => {
    const parsed = updatePermissionsSchema.safeParse({
      ADMIN: { ...fullRole(), 'reports.view': true },
      STAFF: fullRole(),
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown permission key', () => {
    const parsed = updatePermissionsSchema.safeParse({
      ADMIN: { ...fullRole(), 'bogus.key': true },
      STAFF: fullRole(),
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a missing key (the editor always sends the whole matrix)', () => {
    const partial = fullRole();
    delete (partial as Record<string, boolean>)['sales.refund'];
    const parsed = updatePermissionsSchema.safeParse({
      ADMIN: partial,
      STAFF: fullRole(),
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a non-boolean value', () => {
    const parsed = updatePermissionsSchema.safeParse({
      ADMIN: { ...fullRole(), 'reports.view': 'yes' },
      STAFF: fullRole(),
    });
    expect(parsed.success).toBe(false);
  });
});
