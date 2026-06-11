'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';
import type { PageMeta } from '@/hooks/use-pagination';
import { inventoryKeys } from '@/modules/inventory/hooks/inventory-keys';

import { orderKeys } from './order-keys';
import type { CancelOrderInput, MarkShippedInput, SetResiInput } from '../validators/order-actions';
import type { MultiPullOrdersResult, OrderDetail, OrderListItem } from '../types';

/** A page of orders (mirror of the server's PaginatedResult). */
export type OrdersPage = {
  items: OrderListItem[];
  meta: PageMeta;
};

export type OrdersListFilters = {
  /** Matches order id / resi / buyer, case-insensitive. Empty = off. */
  search?: string;
  /** OrderStatus value; empty = all. */
  status?: string;
};

export function useOrdersQuery(page: number, pageSize: number, filters: OrdersListFilters = {}) {
  const search = filters.search?.trim() ?? '';
  const status = filters.status ?? '';

  return useQuery({
    queryKey: orderKeys.list(page, pageSize, search, status),
    queryFn: async () => {
      const result = await apiFetch<OrdersPage>(apiRoutes.orders, {
        params: {
          page,
          pageSize,
          ...(search ? { search } : {}),
          ...(status ? { status } : {}),
        },
      });

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    placeholderData: keepPreviousData,
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

/** Manually mark a paid order shipped (optionally set the tracking number). */
export function useMarkOrderShippedMutation(orderId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: MarkShippedInput = {}) => {
      const result = await apiFetch<OrderDetail>(`${apiRoutes.orders}/${orderId}/ship`, {
        method: 'POST',
        body: input,
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

/** Set or update an order's tracking number. */
export function useSetOrderResiMutation(orderId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SetResiInput) => {
      const result = await apiFetch<OrderDetail>(`${apiRoutes.orders}/${orderId}/resi`, {
        method: 'POST',
        body: input,
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
    },
  });
}

/** Manually cancel a not-yet-shipped order, releasing any reserved stock. */
export function useCancelOrderMutation(orderId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CancelOrderInput = {}) => {
      const result = await apiFetch<OrderDetail>(`${apiRoutes.orders}/${orderId}/cancel`, {
        method: 'POST',
        body: input,
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
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
