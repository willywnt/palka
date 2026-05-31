'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';

import type {
  MarketplaceAccountDetailDto,
  MarketplaceAccountListItemDto,
} from '../dto/marketplace.dto';
import type { ConnectMarketplaceAccountInput } from '../validators/connect-account';
import type { ReconnectMarketplaceAccountInput } from '../validators/reconnect-account';

export const marketplaceKeys = {
  all: ['marketplace-accounts'] as const,
  list: () => ['marketplace-accounts', 'list'] as const,
  detail: (id: string) => ['marketplace-accounts', 'detail', id] as const,
};

export function useMarketplaceAccountsQuery() {
  return useQuery({
    queryKey: marketplaceKeys.list(),
    queryFn: async () => {
      const result = await apiFetch<MarketplaceAccountListItemDto[]>(apiRoutes.marketplace);

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
  });
}

/** @deprecated Use useMarketplaceAccountsQuery */
export const useMarketplaceConnectionsQuery = useMarketplaceAccountsQuery;

export function useMarketplaceAccountQuery(id: string | null, enabled = true) {
  return useQuery({
    queryKey: marketplaceKeys.detail(id ?? 'unknown'),
    queryFn: async () => {
      const result = await apiFetch<MarketplaceAccountDetailDto>(`${apiRoutes.marketplace}/${id}`);

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    enabled: Boolean(id) && enabled,
  });
}

/** @deprecated Use useMarketplaceAccountQuery */
export const useMarketplaceConnectionQuery = useMarketplaceAccountQuery;

export function useConnectMarketplaceAccountMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ConnectMarketplaceAccountInput) => {
      const result = await apiFetch<MarketplaceAccountDetailDto>(apiRoutes.marketplace, {
        method: 'POST',
        body: input,
      });

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: marketplaceKeys.all });
    },
  });
}

/** @deprecated Use useConnectMarketplaceAccountMutation */
export const useCreateMarketplaceConnectionMutation = useConnectMarketplaceAccountMutation;

export function useReconnectMarketplaceAccountMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      accountId,
      input,
    }: {
      accountId: string;
      input: ReconnectMarketplaceAccountInput;
    }) => {
      const result = await apiFetch<MarketplaceAccountDetailDto>(
        `${apiRoutes.marketplace}/${accountId}/reconnect`,
        { method: 'POST', body: input },
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: marketplaceKeys.all });
    },
  });
}

export function useDisconnectMarketplaceAccountMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (accountId: string) => {
      const result = await apiFetch<MarketplaceAccountDetailDto>(
        `${apiRoutes.marketplace}/${accountId}`,
        { method: 'DELETE' },
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onMutate: async (accountId) => {
      await queryClient.cancelQueries({ queryKey: marketplaceKeys.list() });

      const previous = queryClient.getQueryData<MarketplaceAccountListItemDto[]>(
        marketplaceKeys.list(),
      );

      queryClient.setQueryData<MarketplaceAccountListItemDto[]>(
        marketplaceKeys.list(),
        (current) =>
          current?.map((item) =>
            item.id === accountId
              ? {
                  ...item,
                  status: 'DISCONNECTED' as const,
                  health: {
                    ...item.health,
                    status: 'DISCONNECTED' as const,
                    requiresReconnect: true,
                    syncEligible: false,
                    issues: ['disconnected'],
                    refreshFailureCount: item.health.refreshFailureCount,
                    lastValidatedAt: item.health.lastValidatedAt,
                    lastRefreshAt: item.health.lastRefreshAt,
                  },
                }
              : item,
          ) ?? [],
      );

      return { previous };
    },
    onError: (_error, _accountId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(marketplaceKeys.list(), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: marketplaceKeys.all });
    },
  });
}

/** @deprecated Use useDisconnectMarketplaceAccountMutation */
export const useDisconnectMarketplaceMutation = useDisconnectMarketplaceAccountMutation;
