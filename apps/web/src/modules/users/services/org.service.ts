import 'server-only';

import { prisma } from '@falka/db';
import type { OrgRole, Prisma } from '@prisma/client';

import { AppError } from '@/lib/errors';
import type { PermissionKey, PermissionMatrix } from '../permissions/catalog';
import { normalizeMatrix } from '../permissions/resolve';

import type { OrgSummary } from '../types';

export class OrgService {
  async getSummary(
    organizationId: string,
    role: OrgRole,
    permissions: PermissionKey[],
  ): Promise<OrgSummary> {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, deletedAt: true },
    });

    if (!organization || organization.deletedAt) {
      throw AppError.notFound('Organisasi tidak ditemukan');
    }

    return { id: organization.id, name: organization.name, role, permissions };
  }

  async rename(organizationId: string, name: string): Promise<OrgSummary['name']> {
    const updated = await prisma.organization.update({
      where: { id: organizationId },
      data: { name },
      select: { name: true },
    });

    return updated.name;
  }

  /**
   * The org's configurable permission matrix (what ADMIN/STAFF may do). A null
   * column means "catalog defaults", so normalizeMatrix always returns a complete
   * matrix the OWNER editor can render and toggle.
   */
  async getPermissionMatrix(organizationId: string): Promise<PermissionMatrix> {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { permissions: true, deletedAt: true },
    });

    if (!organization || organization.deletedAt) {
      throw AppError.notFound('Organisasi tidak ditemukan');
    }

    return normalizeMatrix(organization.permissions);
  }

  /**
   * Persist the OWNER-edited matrix. We normalize through the catalog so only
   * known keys survive (unknown keys dropped, missing keys defaulted) — the
   * stored shape is always complete and trustworthy for the resolver.
   */
  async updatePermissions(organizationId: string, matrix: PermissionMatrix): Promise<void> {
    const normalized: PermissionMatrix = normalizeMatrix(matrix);

    await prisma.organization.update({
      where: { id: organizationId },
      data: { permissions: normalized as Prisma.InputJsonValue },
    });
  }
}

export const orgService = new OrgService();
