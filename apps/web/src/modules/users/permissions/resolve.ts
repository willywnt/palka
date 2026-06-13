import type { OrgRole } from '@prisma/client';

import {
  DEFAULT_PERMISSIONS,
  PERMISSION_KEYS,
  type ConfigurableRole,
  type PermissionKey,
  type PermissionMatrix,
} from './catalog';

/*
 * Pure helpers shared by the server guard and the client UI — no Prisma, no
 * 'server-only', so both sides resolve permissions identically.
 */

function isConfigurableRole(role: OrgRole): role is ConfigurableRole {
  return role === 'ADMIN' || role === 'STAFF';
}

/**
 * Coerce the persisted `Organization.permissions` JSON (which may be null, a
 * partial, or a legacy shape) into a complete matrix, defaulting any missing
 * key to its catalog default. Unknown keys are dropped.
 */
export function normalizeMatrix(raw: unknown): PermissionMatrix {
  const source = (raw ?? {}) as Partial<Record<ConfigurableRole, Record<string, unknown>>>;

  const forRole = (role: ConfigurableRole): Record<PermissionKey, boolean> => {
    const stored = source[role] ?? {};
    return Object.fromEntries(
      PERMISSION_KEYS.map((key) => [
        key,
        typeof stored[key] === 'boolean'
          ? (stored[key] as boolean)
          : DEFAULT_PERMISSIONS[role][key],
      ]),
    ) as Record<PermissionKey, boolean>;
  };

  return { ADMIN: forRole('ADMIN'), STAFF: forRole('STAFF') };
}

/**
 * The effective permission set for a member. OWNER → every key; ADMIN/STAFF →
 * the org's matrix (null = catalog defaults).
 */
export function resolvePermissions(role: OrgRole, rawMatrix: unknown): Set<PermissionKey> {
  if (!isConfigurableRole(role)) {
    return new Set(PERMISSION_KEYS); // OWNER (and any future super role)
  }

  const matrix = normalizeMatrix(rawMatrix);
  return new Set(PERMISSION_KEYS.filter((key) => matrix[role][key]));
}
