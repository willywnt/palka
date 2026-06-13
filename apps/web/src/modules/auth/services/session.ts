import 'server-only';

import type { OrgRole, UserRole } from '@prisma/client';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { orgRoleAtLeast } from '@/lib/org-role';
import { resolveAuthToken } from '@/lib/resolve-auth-token.server';
import type { PermissionKey } from '@/modules/users/permissions/catalog';

import { resolveOrgContext, type OrgContext } from './org-context';
import type { AuthUser } from '../types';

/**
 * Tokens minted before organizations existed carry no org claims — treat them
 * as signed-out so the holder re-logins and gets a fresh, fully-claimed token.
 */
function userFromClaims(claims: {
  id?: string;
  email?: string | null;
  role?: UserRole;
  displayName?: string | null;
  organizationId?: string;
  orgRole?: OrgRole;
}): AuthUser | null {
  if (!claims.id || typeof claims.id !== 'string') {
    return null;
  }

  if (!claims.organizationId || !claims.orgRole) {
    return null;
  }

  return {
    id: claims.id,
    email: claims.email ?? '',
    role: claims.role ?? 'USER',
    displayName: claims.displayName ?? null,
    organizationId: claims.organizationId,
    orgRole: claims.orgRole,
  };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await auth();

  if (session?.user?.id) {
    return userFromClaims(session.user);
  }

  const headerStore = await headers();
  const token = await resolveAuthToken({ headers: headerStore });

  return token ? userFromClaims(token) : null;
}

export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return user;
}

/**
 * Page/RSC guard: the authenticated user must hold at least `min` in their org
 * (checked against the DB, not the token). Falls back to the dashboard — the
 * page simply isn't theirs to see.
 */
export async function requireOrgRole(
  min: 'ADMIN' | 'OWNER',
): Promise<AuthUser & { org: OrgContext }> {
  const user = await requireAuth();
  const org = await resolveOrgContext(user.id);

  if (!org) {
    redirect('/login');
  }

  if (!orgRoleAtLeast(org.role, min)) {
    redirect('/dashboard');
  }

  return { ...user, org };
}

/**
 * Page/RSC guard for the platform admin-ops console — the user must be a
 * platform ADMIN (`UserRole.ADMIN`), independent of any org role. Non-admins
 * fall back to the dashboard.
 */
export async function requirePlatformAdmin(): Promise<AuthUser> {
  const user = await requireAuth();

  if (user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  return user;
}

/**
 * Page/RSC guard mirroring `requirePermission` route guards: the member must
 * hold the given configurable permission (OWNER always does). Off → dashboard.
 */
export async function requireOrgPermission(
  permission: PermissionKey,
): Promise<AuthUser & { org: OrgContext }> {
  const user = await requireAuth();
  const org = await resolveOrgContext(user.id);

  if (!org) {
    redirect('/login');
  }

  if (!org.permissions.has(permission)) {
    redirect('/dashboard');
  }

  return { ...user, org };
}
