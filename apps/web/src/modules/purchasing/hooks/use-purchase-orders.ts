'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';
import type { PageMeta } from '@/hooks/use-pagination';
import { inventoryKeys } from '@/modules/inventory/hooks/inventory-keys';

import { purchaseOrderKeys } from './purchase-order-keys';
import type { CreatePurchaseOrderInput } from '../validators/create-po';
import type { ReceivePurchaseOrderInput } from '../validators/receive-po';
import type { PurchasableVariant, PurchaseOrderDetail, PurchaseOrderListItem } from '../types';

/** A page of PO-picker variants (mirror of the server's PaginatedResult). */
export type PurchasableVariantsPage = {
  items: PurchasableVariant[];
  meta: PageMeta;
};

export function usePurchaseOrdersQuery() {
  return useQuery({
    queryKey: purchaseOrderKeys.list,
    queryFn: async () => {
      const result = await apiFetch<PurchaseOrderListItem[]>(apiRoutes.purchaseOrders);
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
  });
}

export function usePurchaseOrderQuery(id: string | null, enabled = true) {
  return useQuery({
    queryKey: purchaseOrderKeys.detail(id ?? 'unknown'),
    queryFn: async () => {
      const result = await apiFetch<PurchaseOrderDetail>(`${apiRoutes.purchaseOrders}/${id}`);
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    enabled: Boolean(id) && enabled,
  });
}

/** A paginated page of PO-picker variants (debounced search by SKU/name). */
export function usePurchaseVariantsQuery(
  q: string,
  page: number,
  pageSize: number,
  enabled = true,
) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: purchaseOrderKeys.variants(trimmed, page, pageSize),
    queryFn: async () => {
      const result = await apiFetch<PurchasableVariantsPage>(
        `${apiRoutes.purchaseOrders}/variants`,
        { params: { page, pageSize, ...(trimmed ? { q: trimmed } : {}) } },
      );
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Resolve a scanned code (barcode/SKU) to a variant for a PO line. */
export function useResolvePurchaseVariantMutation() {
  return useMutation({
    mutationFn: async (code: string) => {
      const result = await apiFetch<PurchasableVariant | null>(
        `${apiRoutes.purchaseOrders}/variants/resolve`,
        { params: { code } },
      );
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
  });
}

export function useCreatePurchaseOrderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePurchaseOrderInput) => {
      const result = await apiFetch<PurchaseOrderDetail>(apiRoutes.purchaseOrders, {
        method: 'POST',
        body: input,
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.all });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useReceivePurchaseOrderMutation(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ReceivePurchaseOrderInput) => {
      const result = await apiFetch<PurchaseOrderDetail>(
        `${apiRoutes.purchaseOrders}/${id}/receive`,
        { method: 'POST', body: input },
      );
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.all });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useCancelPurchaseOrderMutation(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await apiFetch<PurchaseOrderDetail>(
        `${apiRoutes.purchaseOrders}/${id}/cancel`,
        { method: 'POST' },
      );
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.all });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}
