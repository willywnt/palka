'use client';

import { useMutation, useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';

import type { ChangePasswordInput } from '../validators/change-password';

export type AccountSecurityInfo = {
  lastLoginAt: string | null;
  lastLoginIp: string | null;
};

/** The signed-in user's last-login info (time + IP) for the Settings security view. */
export function useAccountSecurityQuery() {
  return useQuery({
    queryKey: ['account', 'security'],
    queryFn: async (): Promise<AccountSecurityInfo> => {
      const result = await apiFetch<AccountSecurityInfo>(`${apiRoutes.account}/security`);
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
  });
}

/** Change the signed-in user's own password (verifies the current one server-side). */
export function useChangePasswordMutation() {
  return useMutation({
    mutationFn: async (input: ChangePasswordInput) => {
      const result = await apiFetch<null>(`${apiRoutes.account}/password`, {
        method: 'POST',
        body: input,
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
  });
}
