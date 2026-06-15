'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';
import type { PageMeta } from '@/hooks/use-pagination';

import type { ImportListingsResult, MarketplaceListingItem } from '../types';
import type { ListingStatusFilter } from '../validators/list-listings';

/** A page of listings (mirror of the server's PaginatedResult). */
export type MarketplaceListingsPage = {
  items: MarketplaceListingItem[];
  meta: PageMeta;
};

export type ListingsFilters = {
  search?: string;
  status?: ListingStatusFilter;
};

export const marketplaceListingKeys = {
  all: (connectionId: string) => ['marketplace-listings', connectionId] as const,
  list: (connectionId: string, page: number, pageSize: number, filters: ListingsFilters) =>
    ['marketplace-listings', connectionId, 'list', page, pageSize, filters] as const,
};

export function useMarketplaceListingsQuery(
  connectionId: string,
  page: number,
  pageSize: number,
  filters: ListingsFilters = {},
) {
  const search = filters.search?.trim() ?? '';
  const status = filters.status ?? '';

  return useQuery({
    queryKey: marketplaceListingKeys.list(connectionId, page, pageSize, {
      search,
      status: filters.status,
    }),
    queryFn: async () => {
      const result = await apiFetch<MarketplaceListingsPage>(
        `${apiRoutes.marketplace}/${connectionId}/listings`,
        {
          params: {
            page,
            pageSize,
            ...(search ? { search } : {}),
            ...(status ? { status } : {}),
          },
        },
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    placeholderData: keepPreviousData,
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

export function useRerunAutoMapMutation(connectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await apiFetch<{ autoMapped: number }>(
        `${apiRoutes.marketplace}/${connectionId}/auto-map`,
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
