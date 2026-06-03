'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';

import { orderKeys } from './order-keys';
import type { OrderDetail, OrderListItem, PullOrdersResult } from '../types';

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

/** Triggered from a marketplace connection; pulls that store's orders into the SoT. */
export function usePullOrdersMutation(connectionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await apiFetch<PullOrdersResult>(
        `${apiRoutes.marketplace}/${connectionId}/orders/pull`,
        { method: 'POST' },
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
    },
  });
}
