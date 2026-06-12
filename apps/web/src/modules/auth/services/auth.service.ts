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
   * Registration creates the user AND their own organization (as OWNER) in one
   * transaction. (Joining an existing org via an invite code lands in the team
   * phase — it reuses this same tx shape minus the org create.)
   */
  async registerUser(input: {
    email: string;
    password: string;
    displayName?: string;
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
    const orgName = `Toko ${displayName ?? normalizedEmail.split('@')[0]}`;

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          displayName,
        },
        select: { id: true, email: true, role: true, displayName: true },
      });

      const organization = await tx.organization.create({
        data: {
          name: orgName,
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
