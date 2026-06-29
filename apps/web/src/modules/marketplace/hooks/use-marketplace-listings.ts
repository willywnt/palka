'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';
import type { PageMeta } from '@/hooks/use-pagination';

import type { MarketplaceImportJobDto, MarketplaceListingItem } from '../types';
import type { ListingStatusFilter } from '../validators/list-listings';
import { marketplaceKeys } from './use-marketplace-connections';

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
  importJob: (connectionId: string) => ['marketplace-import-job', connectionId] as const,
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

/**
 * Polls the connection's latest catalog-import job. While a job is PENDING/PROCESSING it refetches
 * every 2s (driving the progress banner); it also reads once on mount so a refresh / revisit
 * reconnects to an in-flight import. Returns null when the connection has never been imported.
 */
export function useImportJobQuery(connectionId: string) {
  return useQuery({
    queryKey: marketplaceListingKeys.importJob(connectionId),
    queryFn: async () => {
      const result = await apiFetch<MarketplaceImportJobDto | null>(
        `${apiRoutes.marketplace}/${connectionId}/import-job`,
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'PENDING' || status === 'PROCESSING' ? 2000 : false;
    },
  });
}

/**
 * Starts an import. The server returns a job DTO: a Lazada import is a background job (PENDING →
 * the {@link useImportJobQuery} poll takes over), while a non-Lazada stub finishes inline
 * (`async=false`, already COMPLETED). Seeds the poll cache so the progress banner shows at once.
 */
export function useImportListingsMutation(connectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await apiFetch<MarketplaceImportJobDto>(
        `${apiRoutes.marketplace}/${connectionId}/import`,
        { method: 'POST' },
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: (job) => {
      queryClient.setQueryData(marketplaceListingKeys.importJob(connectionId), job);
      // An inline (non-Lazada) import is already done — refresh listings now. A background job
      // refreshes them when the poll sees it finish (handled in the detail component).
      if (!job.async) {
        void queryClient.invalidateQueries({ queryKey: marketplaceListingKeys.all(connectionId) });
      }
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
      // Refresh the in-flight poll so the "sinkronisasi berjalan" indicator + waiting state
      // pick up the just-queued job immediately.
      void queryClient.invalidateQueries({ queryKey: marketplaceKeys.syncStatus(connectionId) });
    },
  });
}
