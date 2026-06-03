'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';

import { inventoryKeys } from './inventory-keys';
import type { AdjustStockResult, InventoryView, StockOverviewItem } from '../types';
import type { AdjustStockInput } from '../validators/adjust-stock';

export function useStockOverviewQuery(search: string | undefined, lowStockOnly: boolean) {
  return useQuery({
    queryKey: inventoryKeys.overview(search, lowStockOnly),
    queryFn: async () => {
      const result = await apiFetch<StockOverviewItem[]>(`${apiRoutes.inventory}/variants`, {
        params: {
          ...(search ? { search } : {}),
          ...(lowStockOnly ? { lowStockOnly: 'true' } : {}),
        },
      });

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
  });
}

export function useVariantInventoryQuery(variantId: string | null, enabled = true) {
  return useQuery({
    queryKey: inventoryKeys.variant(variantId ?? 'unknown'),
    queryFn: async () => {
      const result = await apiFetch<InventoryView>(`${apiRoutes.inventory}/variants/${variantId}`);

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    enabled: Boolean(variantId) && enabled,
  });
}

export function useAdjustStockMutation(variantId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AdjustStockInput) => {
      const result = await apiFetch<AdjustStockResult>(
        `${apiRoutes.inventory}/variants/${variantId}/adjust`,
        { method: 'POST', body: input },
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}
