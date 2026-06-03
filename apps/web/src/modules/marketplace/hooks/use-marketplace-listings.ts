'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';

import type { ImportListingsResult, MarketplaceListingItem } from '../types';

export const marketplaceListingKeys = {
  all: (connectionId: string) => ['marketplace-listings', connectionId] as const,
};

export function useMarketplaceListingsQuery(connectionId: string) {
  return useQuery({
    queryKey: marketplaceListingKeys.all(connectionId),
    queryFn: async () => {
      const result = await apiFetch<MarketplaceListingItem[]>(
        `${apiRoutes.marketplace}/${connectionId}/listings`,
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
  });
}

export function useImportListingsMutation(connectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await apiFetch<ImportListingsResult>(
        `${apiRoutes.marketplace}/${connectionId}/import`,
        { method: 'POST' },
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: marketplaceListingKeys.all(connectionId) });
    },
  });
}

export function useMapListingMutation(connectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      marketplaceProductId,
      variantId,
    }: {
      marketplaceProductId: string;
      variantId: string;
    }) => {
      const result = await apiFetch<MarketplaceListingItem>(
        `${apiRoutes.marketplace}/${connectionId}/listings/${marketplaceProductId}/map`,
        { method: 'POST', body: { variantId } },
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: marketplaceListingKeys.all(connectionId) });
    },
  });
}

export function useUnmapListingMutation(connectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (marketplaceProductId: string) => {
      const result = await apiFetch<MarketplaceListingItem>(
        `${apiRoutes.marketplace}/${connectionId}/listings/${marketplaceProductId}/map`,
        { method: 'DELETE' },
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: marketplaceListingKeys.all(connectionId) });
    },
  });
}

export function useSetSyncEnabledMutation(connectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      marketplaceProductId,
      syncEnabled,
    }: {
      marketplaceProductId: string;
      syncEnabled: boolean;
    }) => {
      const result = await apiFetch<MarketplaceListingItem>(
        `${apiRoutes.marketplace}/${connectionId}/listings/${marketplaceProductId}/sync`,
        { method: 'PATCH', body: { syncEnabled } },
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: marketplaceListingKeys.all(connectionId) });
    },
  });
}

export function useSyncNowMutation(connectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (marketplaceProductId: string) => {
      const result = await apiFetch<MarketplaceListingItem>(
        `${apiRoutes.marketplace}/${connectionId}/listings/${marketplaceProductId}/sync`,
        { method: 'POST' },
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: marketplaceListingKeys.all(connectionId) });
    },
  });
}
