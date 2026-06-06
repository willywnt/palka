'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';
import { inventoryKeys } from '@/modules/inventory/hooks/inventory-keys';

import { saleKeys } from './sale-keys';
import type { CreateSaleInput } from '../validators/create-sale';
import type { SaleDetail, SaleListItem, SellableVariant } from '../types';

export function useSalesQuery() {
  return useQuery({
    queryKey: saleKeys.list,
    queryFn: async () => {
      const result = await apiFetch<SaleListItem[]>(apiRoutes.sales);
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
  });
}

export function useSaleQuery(id: string | null, enabled = true) {
  return useQuery({
    queryKey: saleKeys.detail(id ?? 'unknown'),
    queryFn: async () => {
      const result = await apiFetch<SaleDetail>(`${apiRoutes.sales}/${id}`);
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    enabled: Boolean(id) && enabled,
  });
}

/** Variants for the POS picker (debounced search by SKU/name). */
export function useSellableVariantsQuery(q: string, enabled = true) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: saleKeys.variants(trimmed),
    queryFn: async () => {
      const result = await apiFetch<SellableVariant[]>(
        `${apiRoutes.sales}/variants?q=${encodeURIComponent(trimmed)}`,
      );
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    enabled,
  });
}

/** Resolve a scanned code (barcode/SKU) to a sellable variant for the POS cart. */
export function useResolveVariantMutation() {
  return useMutation({
    mutationFn: async (code: string) => {
      const result = await apiFetch<SellableVariant | null>(`${apiRoutes.sales}/variants/resolve`, {
        params: { code },
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
  });
}

export function useCreateSaleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateSaleInput) => {
      const result = await apiFetch<SaleDetail>(apiRoutes.sales, { method: 'POST', body: input });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: saleKeys.all });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useVoidSaleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (saleId: string) => {
      const result = await apiFetch<SaleDetail>(`${apiRoutes.sales}/${saleId}/void`, {
        method: 'POST',
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: saleKeys.all });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}
