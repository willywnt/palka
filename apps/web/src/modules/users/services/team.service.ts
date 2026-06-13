import 'server-only';

import { prisma } from '@falka/db';
import type { OrgRole } from '@prisma/client';

import { AppError } from '@/lib/errors';
import { retryOnCodeCollision } from '@/lib/db-retry';
import { orgRoleAtLeast } from '@/lib/org-role';
import { auditService } from '@/modules/audit/services/audit.service';

import { generateInviteCode } from '../utils/invite-code';
import type { TeamInviteItem, TeamMemberItem } from '../types';

/** Days an invite code stays usable before it expires. */
const INVITE_TTL_DAYS = 7;
const INVITE_TTL_MS = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

export class TeamService {
  /** Members of the org, OWNER first, then newest joiners. */
  async listMembers(organizationId: string, requestingUserId: string): Promise<TeamMemberItem[]> {
    const members = await prisma.organizationMember.findMany({
      where: { organizationId },
      select: {
        userId: true,
        role: true,
        createdAt: true,
        user: { select: { displayName: true, email: true } },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });

    // role 'asc' puts ADMIN before OWNER before STAFF alphabetically — re-rank
    // so OWNER leads, then ADMIN, then STAFF.
    const rank: Record<OrgRole, number> = { OWNER: 0, ADMIN: 1, STAFF: 2 };

    return members
      .slice()
      .sort((a, b) => rank[a.role] - rank[b.role] || +a.createdAt - +b.createdAt)
      .map((member) => ({
        userId: member.userId,
        name: member.user.displayName ?? member.user.email,
        email: member.user.email,
        role: member.role,
        joinedAt: member.createdAt.toISOString(),
        isSelf: member.userId === requestingUserId,
      }));
  }

  /** Pending (usable) invite codes for the org, newest first. */
  async listInvites(organizationId: string): Promise<TeamInviteItem[]> {
    const invites = await prisma.organizationInvite.findMany({
      where: {
        organizationId,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, code: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    return invites.map((invite) => ({
      id: invite.id,
      code: invite.code,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
    }));
  }

  /**
   * Mint a single-use invite code. Hybrid authority: an ADMIN may only invite
   * STAFF; minting an ADMIN invite requires OWNER.
   */
  async createInvite(
    organizationId: string,
    actor: { userId: string; role: OrgRole },
    role: OrgRole,
  ): Promise<TeamInviteItem> {
    if (role === 'ADMIN' && !orgRoleAtLeast(actor.role, 'OWNER')) {
      throw AppError.forbidden('Hanya pemilik yang bisa mengundang admin.');
    }

    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const invite = await retryOnCodeCollision(() =>
      prisma.organizationInvite.create({
        data: {
          organizationId,
          code: generateInviteCode(),
          role,
          expiresAt,
          createdByUserId: actor.userId,
        },
        select: { id: true, code: true, role: true, expiresAt: true, createdAt: true },
      }),
    );

    void auditService.log({
      organizationId,
      actorUserId: actor.userId,
      action: 'team.invite.created',
      resource: 'organization_invite',
      resourceId: invite.id,
      metadata: { role: invite.role },
    });

    return {
      id: invite.id,
      code: invite.code,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
    };
  }

  /** Revoke a pending invite so its code can no longer be redeemed. */
  async revokeInvite(organizationId: string, actorUserId: string, inviteId: string): Promise<void> {
    const invite = await prisma.organizationInvite.findFirst({
      where: { id: inviteId, organizationId },
      select: { id: true, usedAt: true, revokedAt: true },
    });

    if (!invite) throw AppError.notFound('Undangan tidak ditemukan.');
    if (invite.usedAt) throw AppError.validation('Undangan ini sudah dipakai.');
    if (invite.revokedAt) return; // already revoked — idempotent

    await prisma.organizationInvite.update({
      where: { id: inviteId },
      data: { revokedAt: new Date() },
    });

    void auditService.log({
      organizationId,
      actorUserId,
      action: 'team.invite.revoked',
      resource: 'organization_invite',
      resourceId: inviteId,
    });
  }

  /** Change a member's role. The OWNER row is immutable through this path. */
  async updateMemberRole(
    organizationId: string,
    actorUserId: string,
    memberUserId: string,
    role: OrgRole,
  ): Promise<void> {
    const member = await this.getModifiableMember(organizationId, memberUserId);

    if (member.role === role) return;

    await prisma.organizationMember.update({
      where: { organizationId_userId: { organizationId, userId: memberUserId } },
      data: { role },
    });

    void auditService.log({
      organizationId,
      actorUserId,
      action: 'team.member.role_changed',
      resource: 'organization_member',
      resourceId: memberUserId,
      metadata: { from: member.role, to: role },
    });
  }

  /** Remove a member from the org (their account stays, but loses all access). */
  async removeMember(
    organizationId: string,
    actorUserId: string,
    memberUserId: string,
  ): Promise<void> {
    await this.getModifiableMember(organizationId, memberUserId);

    await prisma.organizationMember.delete({
      where: { organizationId_userId: { organizationId, userId: memberUserId } },
    });

    void auditService.log({
      organizationId,
      actorUserId,
      action: 'team.member.removed',
      resource: 'organization_member',
      resourceId: memberUserId,
    });
  }

  /** A member that exists in the org and is NOT the (immutable) OWNER. */
  private async getModifiableMember(organizationId: string, memberUserId: string) {
    const member = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: memberUserId } },
      select: { role: true },
    });

    if (!member) throw AppError.notFound('Anggota tidak ditemukan.');
    if (member.role === 'OWNER') {
      throw AppError.forbidden('Pemilik organisasi tidak bisa diubah atau dihapus.');
    }

    return member;
  }
}

export const teamService = new TeamService();
