'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StockLedgerReason, StockLedgerSource } from '@prisma/client';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';

import { inventoryKeys } from './inventory-keys';
import type {
  AdjustStockResult,
  InventoryDashboard,
  InventoryView,
  ReorderReport,
  StockActivityItem,
  StockOverviewItem,
} from '../types';
import type { AdjustStockInput } from '../validators/adjust-stock';
import type { DisposeDamagedInput } from '../validators/dispose-damaged';
import type { ReorderReportQuery } from '../validators/reorder-report';

/** Client-held filter state for the stock activity log. Empty string = unset. */
export type StockActivityFilters = {
  page: number;
  search: string;
  reason: StockLedgerReason | '';
  source: StockLedgerSource | '';
  direction: '' | 'in' | 'out';
  from: string;
  to: string;
};

/** Drops empty filters and serializes the rest into URL query params. */
export function stockActivityParams(
  filters: StockActivityFilters,
): Record<string, string | number> {
  return {
    page: filters.page,
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.reason ? { reason: filters.reason } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...(filters.direction ? { direction: filters.direction } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
  };
}

export function useInventoryDashboardQuery() {
  return useQuery({
    queryKey: inventoryKeys.dashboard,
    queryFn: async () => {
      const result = await apiFetch<InventoryDashboard>(`${apiRoutes.inventory}/dashboard`);

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
  });
}

export function useReorderReportQuery(params: ReorderReportQuery) {
  return useQuery({
    queryKey: inventoryKeys.reorder(params),
    queryFn: async () => {
      const result = await apiFetch<ReorderReport>(`${apiRoutes.inventory}/reorder`, {
        params: {
          windowDays: String(params.windowDays),
          leadTimeDays: String(params.leadTimeDays),
          targetCoverDays: String(params.targetCoverDays),
        },
      });

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
  });
}

export function useStockActivityQuery(filters: StockActivityFilters) {
  const params = stockActivityParams(filters);

  return useQuery({
    queryKey: inventoryKeys.activity(params),
    queryFn: async () => {
      const result = await apiFetch<StockActivityItem[]>(`${apiRoutes.inventory}/activity`, {
        params,
      });

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return { items: result.data, meta: result.meta };
    },
    placeholderData: keepPreviousData,
  });
}

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

/** Write off damaged-bucket units (disposal); available is unchanged. */
export function useDisposeDamagedMutation(variantId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DisposeDamagedInput) => {
      const result = await apiFetch<AdjustStockResult>(
        `${apiRoutes.inventory}/variants/${variantId}/dispose-damaged`,
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
