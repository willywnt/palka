'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';

import type { MarketplaceConnectionDetail, MarketplaceConnectionListItem } from '../types';
import type { CreateMarketplaceConnectionInput } from '../validators/create-connection';

export const marketplaceKeys = {
  all: ['marketplace-connections'] as const,
  list: () => ['marketplace-connections', 'list'] as const,
  detail: (id: string) => ['marketplace-connections', 'detail', id] as const,
  health: () => ['marketplace-connections', 'health'] as const,
};

export function useMarketplaceConnectionsQuery() {
  return useQuery({
    queryKey: marketplaceKeys.list(),
    queryFn: async () => {
      const result = await apiFetch<MarketplaceConnectionListItem[]>(apiRoutes.marketplace);

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
  });
}

export function useMarketplaceConnectionQuery(id: string | null, enabled = true) {
  return useQuery({
    queryKey: marketplaceKeys.detail(id ?? 'unknown'),
    queryFn: async () => {
      const result = await apiFetch<MarketplaceConnectionDetail>(`${apiRoutes.marketplace}/${id}`);

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    enabled: Boolean(id) && enabled,
  });
}

export function useCreateMarketplaceConnectionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateMarketplaceConnectionInput) => {
      const result = await apiFetch<MarketplaceConnectionDetail>(apiRoutes.marketplace, {
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

export function useRefreshConnectionMutation(connectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await apiFetch<MarketplaceConnectionDetail>(
        `${apiRoutes.marketplace}/${connectionId}/refresh`,
        { method: 'POST' },
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

export function useTestConnectionMutation(connectionId: string) {
  return useMutation({
    mutationFn: async () => {
      const result = await apiFetch<{ ready: boolean; reason?: string }>(
        `${apiRoutes.marketplace}/${connectionId}/test`,
        { method: 'POST' },
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
  });
}

export function useDisconnectMarketplaceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (connectionId: string) => {
      const result = await apiFetch<MarketplaceConnectionDetail>(
        `${apiRoutes.marketplace}/${connectionId}`,
        { method: 'DELETE' },
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onMutate: async (connectionId) => {
      await queryClient.cancelQueries({ queryKey: marketplaceKeys.list() });

      const previous = queryClient.getQueryData<MarketplaceConnectionListItem[]>(
        marketplaceKeys.list(),
      );

      queryClient.setQueryData<MarketplaceConnectionListItem[]>(
        marketplaceKeys.list(),
        (current) =>
          current?.map((item) =>
            item.id === connectionId
              ? {
                  ...item,
                  isActive: false,
                  connectionStatus: 'disconnected' as const,
                }
              : item,
          ) ?? [],
      );

      return { previous };
    },
    onError: (_error, _connectionId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(marketplaceKeys.list(), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: marketplaceKeys.all });
    },
  });
}
