import { z } from 'zod';

import { PERMISSION_KEYS, type PermissionKey } from '../permissions/catalog';

export const renameOrgSchema = z.object({
  name: z.string().trim().min(1, 'Nama organisasi wajib diisi').max(100),
});

export type RenameOrgInput = z.infer<typeof renameOrgSchema>;

/**
 * One allow-map per configurable role: every catalog permission key must be a
 * boolean. Built from PERMISSION_KEYS so unknown keys are rejected (strict) and
 * missing keys fail — the OWNER editor always sends the full matrix.
 */
const roleAllowMapSchema = z
  .object(
    Object.fromEntries(PERMISSION_KEYS.map((key) => [key, z.boolean()])) as Record<
      PermissionKey,
      z.ZodBoolean
    >,
  )
  .strict();

export const updatePermissionsSchema = z.object({
  ADMIN: roleAllowMapSchema,
  STAFF: roleAllowMapSchema,
});

export type UpdatePermissionsInput = z.infer<typeof updatePermissionsSchema>;
