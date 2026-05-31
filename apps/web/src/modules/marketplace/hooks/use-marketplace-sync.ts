'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';

import type {
  MarketplaceSyncJobDetailDto,
  MarketplaceSyncJobListItemDto,
  MarketplaceSyncOverviewDto,
} from '../dto/sync.dto';

export const marketplaceSyncKeys = {
  all: ['marketplace-sync'] as const,
  overview: () => ['marketplace-sync', 'overview'] as const,
  jobs: (filters: Record<string, unknown>) => ['marketplace-sync', 'jobs', filters] as const,
  jobDetail: (id: string) => ['marketplace-sync', 'job', id] as const,
};

export function useMarketplaceSyncOverviewQuery() {
  return useQuery({
    queryKey: marketplaceSyncKeys.overview(),
    queryFn: async () => {
      const result = await apiFetch<MarketplaceSyncOverviewDto>(apiRoutes.marketplaceSyncOverview);
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
  });
}

export function useMarketplaceSyncJobsQuery(filters: {
  marketplaceAccountId?: string;
  syncStatus?: string;
  page?: number;
}) {
  return useQuery({
    queryKey: marketplaceSyncKeys.jobs(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.marketplaceAccountId) {
        params.set('marketplaceAccountId', filters.marketplaceAccountId);
      }
      if (filters.syncStatus) params.set('syncStatus', filters.syncStatus);
      if (filters.page) params.set('page', String(filters.page));

      const result = await apiFetch<MarketplaceSyncJobListItemDto[]>(
        `${apiRoutes.marketplaceSyncJobs}?${params.toString()}`,
      );

      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return { items: result.data, meta: result.meta };
    },
  });
}

export function useMarketplaceSyncJobDetailQuery(syncJobId: string | null) {
  return useQuery({
    queryKey: marketplaceSyncKeys.jobDetail(syncJobId ?? 'none'),
    queryFn: async () => {
      const result = await apiFetch<MarketplaceSyncJobDetailDto>(
        `${apiRoutes.marketplaceSyncJobs}/${syncJobId}`,
      );
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    enabled: Boolean(syncJobId),
  });
}

export function useRetrySyncJobMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (syncJobId: string) => {
      const result = await apiFetch<MarketplaceSyncJobListItemDto>(
        `${apiRoutes.marketplaceSyncJobs}/${syncJobId}/retry`,
        { method: 'POST' },
      );
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: marketplaceSyncKeys.all });
    },
  });
}

export function useDisableMappingSyncMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mappingId: string) => {
      const result = await apiFetch<{ disabled: boolean }>(apiRoutes.marketplaceSyncDisable, {
        method: 'POST',
        body: { mappingId },
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: marketplaceSyncKeys.all });
    },
  });
}
