import 'server-only';

import { prisma } from '@falka/db';
import type { OrgRole } from '@prisma/client';

import { resolvePermissions } from '@/modules/users/permissions/resolve';
import type { PermissionKey } from '@/modules/users/permissions/catalog';

/**
 * The authoritative "which organization, which role, what may I do" for a user
 * — looked up fresh per request (unique-indexed, sub-ms) instead of trusting the
 * JWT claims, so a removed member, a role change, or a permission-matrix edit
 * takes effect immediately even though tokens live 30 days.
 */
export type OrgContext = {
  id: string;
  role: OrgRole;
  /** Effective permission keys for this member (OWNER → all; ADMIN/STAFF → matrix). */
  permissions: ReadonlySet<PermissionKey>;
};

export async function resolveOrgContext(userId: string): Promise<OrgContext | null> {
  const membership = await prisma.organizationMember.findUnique({
    where: { userId },
    select: {
      organizationId: true,
      role: true,
      organization: { select: { deletedAt: true, permissions: true } },
    },
  });

  if (!membership || membership.organization.deletedAt) {
    return null;
  }

  return {
    id: membership.organizationId,
    role: membership.role,
    permissions: resolvePermissions(membership.role, membership.organization.permissions),
  };
}
