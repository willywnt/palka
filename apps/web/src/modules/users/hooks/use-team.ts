'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrgRole } from '@prisma/client';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';
import type { PageMeta } from '@/hooks/use-pagination';
import type { AuditLogListItem } from '@/modules/audit/types';

import { orgKeys } from './org-keys';
import type { TeamInviteItem, TeamMemberItem } from '../types';

const membersUrl = `${apiRoutes.org}/members`;
const invitesUrl = `${apiRoutes.org}/invites`;

export function useTeamMembersQuery() {
  return useQuery({
    queryKey: orgKeys.members,
    queryFn: async () => {
      const result = await apiFetch<TeamMemberItem[]>(membersUrl);
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
  });
}

export function useTeamInvitesQuery() {
  return useQuery({
    queryKey: orgKeys.invites,
    queryFn: async () => {
      const result = await apiFetch<TeamInviteItem[]>(invitesUrl);
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
  });
}

export function useCreateInviteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (role: OrgRole) => {
      const result = await apiFetch<TeamInviteItem>(invitesUrl, { method: 'POST', body: { role } });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.invites }),
  });
}

export function useRevokeInviteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const result = await apiFetch(`${invitesUrl}/${inviteId}`, { method: 'DELETE' });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.invites }),
  });
}

export function useUpdateMemberRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: OrgRole }) => {
      const result = await apiFetch(`${membersUrl}/${userId}`, { method: 'PATCH', body: { role } });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.members }),
  });
}

export function useRemoveMemberMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const result = await apiFetch(`${membersUrl}/${userId}`, { method: 'DELETE' });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.members }),
  });
}

type AuditPage = { items: AuditLogListItem[]; meta: PageMeta };

export function useAuditLogQuery(page: number, pageSize: number) {
  return useQuery({
    queryKey: orgKeys.audit(page, pageSize),
    queryFn: async () => {
      const result = await apiFetch<AuditPage>(apiRoutes.audit, { params: { page, pageSize } });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    placeholderData: keepPreviousData,
  });
}
