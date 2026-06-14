'use client';

import { useMutation, useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';

import type { MarketplaceConnectionHealth, MarketplaceDriftReport } from '../types';
import { marketplaceKeys } from './use-marketplace-connections';

/** Per-connection health for the dashboard badges + nav pulse (computed on-read, cheap). */
export function useMarketplaceHealthQuery(enabled = true) {
  return useQuery({
    queryKey: marketplaceKeys.health(),
    queryFn: async () => {
      const result = await apiFetch<MarketplaceConnectionHealth[]>(
        `${apiRoutes.marketplace}/health`,
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    enabled,
  });
}

/** Run a live drift check against one connection's provider (read-only, on demand). */
export function useDriftCheckMutation(connectionId: string) {
  return useMutation({
    mutationFn: async () => {
      const result = await apiFetch<MarketplaceDriftReport>(
        `${apiRoutes.marketplace}/${connectionId}/drift-check`,
        { method: 'POST' },
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
  });
}
