'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';
import { inventoryKeys } from '@/modules/inventory/hooks/inventory-keys';

import { orderKeys } from './order-keys';
import type { MultiPullOrdersResult, OrderDetail, OrderListItem } from '../types';

export function useOrdersQuery() {
  return useQuery({
    queryKey: orderKeys.list,
    queryFn: async () => {
      const result = await apiFetch<OrderListItem[]>(apiRoutes.orders);

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
  });
}

export function useOrderQuery(id: string | null, enabled = true) {
  return useQuery({
    queryKey: orderKeys.detail(id ?? 'unknown'),
    queryFn: async () => {
      const result = await apiFetch<OrderDetail>(`${apiRoutes.orders}/${id}`);

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    enabled: Boolean(id) && enabled,
  });
}

/** Resolve the most recent order for a tracking number (the packing-station view). */
export function useOrderByResiQuery(noResi: string | null, enabled = true) {
  const trimmed = noResi?.trim() ?? '';
  return useQuery({
    queryKey: orderKeys.byResi(trimmed),
    queryFn: async () => {
      const result = await apiFetch<OrderDetail | null>(
        `${apiRoutes.orders}/by-resi?noResi=${encodeURIComponent(trimmed)}`,
      );
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    enabled: trimmed.length > 0 && enabled,
  });
}

/** Match an unmapped order item to an internal variant (persists the listing mapping). */
export function useResolveOrderItemMutation(orderId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderItemId, variantId }: { orderItemId: string; variantId: string }) => {
      const result = await apiFetch<OrderDetail>(`${apiRoutes.orders}/${orderId}/resolve-item`, {
        method: 'POST',
        body: { orderItemId, variantId },
      });

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

/** Pull orders from several connected stores at once (default: all active). */
export function usePullFromConnectionsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (connectionIds?: string[]) => {
      const result = await apiFetch<MultiPullOrdersResult>(`${apiRoutes.orders}/pull`, {
        method: 'POST',
        body: { connectionIds },
      });

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}
