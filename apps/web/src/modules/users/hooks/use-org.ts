'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';
import { orgRoleAtLeast } from '@/lib/org-role';

import { orgKeys } from './org-keys';
import type { PermissionKey } from '../permissions/catalog';
import type { OrgSummary } from '../types';

/**
 * "My organization" (name + my role), FRESH from the DB — UI gating reads this
 * instead of the 30-day JWT claims so a role change shows up on refetch.
 */
export function useOrg() {
  const query = useQuery({
    queryKey: orgKeys.summary,
    queryFn: async () => {
      const result = await apiFetch<OrgSummary>(apiRoutes.org);
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    staleTime: 60_000,
  });

  return {
    org: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Cosmetic ADMIN gate for hiding privileged UI — while the org is loading (or
 * missing) it reads as NOT admin, so gated controls never flash for STAFF.
 * Server-side guards remain the real boundary.
 */
export function useIsOrgAdmin(): { isAdmin: boolean; isLoading: boolean } {
  const { org, isLoading } = useOrg();
  return {
    isAdmin: org !== null && orgRoleAtLeast(org.role, 'ADMIN'),
    isLoading,
  };
}

/**
 * Cosmetic PERMISSION gate for hiding privileged UI — the configurable matrix
 * replacement for `useIsOrgAdmin` at action sites. While the org is loading (or
 * missing) it reads as NOT allowed, so gated controls never flash. Server-side
 * guards remain the real boundary. OWNER carries every key from the server.
 */
export function useHasPermission(key: PermissionKey): { allowed: boolean; isLoading: boolean } {
  const { org, isLoading } = useOrg();
  return {
    allowed: org !== null && org.permissions.includes(key),
    isLoading,
  };
}

export function useRenameOrgMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const result = await apiFetch<{ name: string }>(apiRoutes.org, {
        method: 'PATCH',
        body: { name },
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}
