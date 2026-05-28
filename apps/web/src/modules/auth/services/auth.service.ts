import 'server-only';

import { DEFAULT_STORAGE_QUOTA_BYTES } from '@olshop/config/limits';
import { prisma } from '@olshop/db';
import type { UserRole } from '@prisma/client';

import { AuthError } from '../errors/auth-errors';
import type { AuthUser } from '../types';
import { hashPassword, verifyPassword } from '../utils/password';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toAuthUser(user: {
  id: string;
  email: string;
  role: UserRole;
  displayName: string | null;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
  };
}

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

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        displayName: input.displayName ?? null,
        storageQuotaBytes: BigInt(DEFAULT_STORAGE_QUOTA_BYTES),
      },
      select: {
        id: true,
        email: true,
        role: true,
        displayName: true,
      },
    });

    return toAuthUser(user);
  }
}

export const authService = new AuthService();
