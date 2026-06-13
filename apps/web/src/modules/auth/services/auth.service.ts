import 'server-only';

import { DEFAULT_STORAGE_QUOTA_BYTES } from '@falka/config/limits';
import { prisma } from '@falka/db';
import type { OrgRole, UserRole } from '@prisma/client';

import { AuthError } from '../errors/auth-errors';
import type { AuthUser } from '../types';
import { hashPassword, verifyPassword } from '../utils/password';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

type UserWithMembership = {
  id: string;
  email: string;
  role: UserRole;
  displayName: string | null;
  membership: { organizationId: string; role: OrgRole } | null;
};

/** Org membership is part of identity now — no membership, no session. */
function toAuthUser(user: UserWithMembership): AuthUser {
  if (!user.membership) {
    throw AuthError.accessRevoked();
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    organizationId: user.membership.organizationId,
    orgRole: user.membership.role,
  };
}

const MEMBERSHIP_SELECT = {
  select: { organizationId: true, role: true },
} as const;

export class AuthService {
  async authenticateUser(email: string, password: string): Promise<AuthUser> {
    const normalizedEmail = normalizeEmail(email);

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        role: true,
        displayName: true,
        passwordHash: true,
        deletedAt: true,
        membership: MEMBERSHIP_SELECT,
      },
    });

    if (!user || user.deletedAt) {
      throw AuthError.invalidCredentials();
    }

    const isValidPassword = await verifyPassword(user.passwordHash, password);

    if (!isValidPassword) {
      throw AuthError.invalidCredentials();
    }

    return toAuthUser(user);
  }

  /**
   * Registration creates the user in one transaction and either:
   *  - with an invite code: atomically claims the (single-use, unexpired) code
   *    and joins that organization with the code's role — NO new org; or
   *  - without a code: creates the user's own organization as OWNER.
   */
  async registerUser(input: {
    email: string;
    password: string;
    displayName?: string;
    inviteCode?: string;
  }): Promise<AuthUser> {
    const normalizedEmail = normalizeEmail(input.email);

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      throw AuthError.emailTaken();
    }

    const passwordHash = await hashPassword(input.password);
    const displayName = input.displayName?.trim() || null;
    const inviteCode = input.inviteCode?.trim().toUpperCase() || null;

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          displayName,
        },
        select: { id: true, email: true, role: true, displayName: true },
      });

      if (inviteCode) {
        // Atomic claim: only an unused, unrevoked, unexpired code flips to used.
        // count 0 means the code lost the race or never qualified.
        const claim = await tx.organizationInvite.updateMany({
          where: {
            code: inviteCode,
            usedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { usedAt: new Date(), usedByUserId: user.id },
        });

        if (claim.count === 0) {
          throw AuthError.invalidInviteCode();
        }

        const invite = await tx.organizationInvite.findUnique({
          where: { code: inviteCode },
          select: { organizationId: true, role: true },
        });

        if (!invite) {
          throw AuthError.invalidInviteCode();
        }

        const membership = await tx.organizationMember.create({
          data: {
            organizationId: invite.organizationId,
            userId: user.id,
            role: invite.role,
          },
          select: { organizationId: true, role: true },
        });

        return toAuthUser({ ...user, membership });
      }

      const organization = await tx.organization.create({
        data: {
          name: `Toko ${displayName ?? normalizedEmail.split('@')[0]}`,
          storageQuotaBytes: BigInt(DEFAULT_STORAGE_QUOTA_BYTES),
        },
        select: { id: true },
      });

      const membership = await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: 'OWNER',
        },
        select: { organizationId: true, role: true },
      });

      return toAuthUser({ ...user, membership });
    });
  }
}

export const authService = new AuthService();
