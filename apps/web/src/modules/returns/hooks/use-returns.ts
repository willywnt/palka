'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReturnStatus } from '@prisma/client';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';
import { inventoryKeys } from '@/modules/inventory/hooks/inventory-keys';
import { orderKeys } from '@/modules/orders/hooks/order-keys';

import { returnKeys } from './return-keys';
import type { ProcessReturnInput } from '../validators/process-return';
import type { ReturnDetail, ReturnListItem } from '../types';

export function useReturnsQuery(status?: ReturnStatus) {
  return useQuery({
    queryKey: returnKeys.list(status),
    queryFn: async () => {
      const query = status ? `?status=${status}` : '';
      const result = await apiFetch<ReturnListItem[]>(`${apiRoutes.returns}${query}`);
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
  });
}

export function useReturnQuery(id: string | null, enabled = true) {
  return useQuery({
    queryKey: returnKeys.detail(id ?? 'unknown'),
    queryFn: async () => {
      const result = await apiFetch<ReturnDetail>(`${apiRoutes.returns}/${id}`);
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    enabled: Boolean(id) && enabled,
  });
}

/** Open a return manually for a shipped/completed order. */
export function useCreateReturnMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason?: string }) => {
      const result = await apiFetch<ReturnDetail>(apiRoutes.returns, {
        method: 'POST',
        body: { orderId, reason },
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: returnKeys.all });
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
    },
  });
}

/** Receive a return: route each line to restock or damaged. */
export function useProcessReturnMutation(returnId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ProcessReturnInput) => {
      const result = await apiFetch<ReturnDetail>(`${apiRoutes.returns}/${returnId}/process`, {
        method: 'POST',
        body: input,
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: returnKeys.all });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

/** Close a return without restocking. */
export function useRejectReturnMutation(returnId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await apiFetch<ReturnDetail>(`${apiRoutes.returns}/${returnId}/reject`, {
        method: 'POST',
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: returnKeys.all });
    },
  });
}
