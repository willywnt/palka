import type { OrgRole } from '@falka/types';

import type { PermissionKey } from '../permissions/catalog';

/** What the shell needs to know about "my organization": name, my role, my permissions. */
export interface OrgSummary {
  id: string;
  name: string;
  role: OrgRole;
  /** Effective permission keys for the current user (OWNER → all). */
  permissions: PermissionKey[];
}

/** A row in the team member list. */
export interface TeamMemberItem {
  userId: string;
  name: string;
  email: string;
  role: OrgRole;
  joinedAt: string;
  /** True for the requesting user's own row (UI disables self-actions). */
  isSelf: boolean;
}

/** A pending (usable) invite code. */
export interface TeamInviteItem {
  id: string;
  code: string;
  role: OrgRole;
  expiresAt: string;
  createdAt: string;
}

export interface UserListItem {
  id: string;
  email: string;
  name: string;
  role: OrgRole;
  createdAt: string;
}

export interface UsersModuleConfig {
  defaultRole: OrgRole;
}

export const usersModuleConfig: UsersModuleConfig = {
  defaultRole: 'STAFF',
};
