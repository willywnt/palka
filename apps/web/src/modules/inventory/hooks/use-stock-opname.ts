'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';
import type { PageMeta } from '@/hooks/use-pagination';

import { inventoryKeys } from './inventory-keys';
import { stockOpnameKeys } from './stock-opname-keys';
import type { CountableVariant, StockOpnameDetail, StockOpnameListItem } from '../types';
import type { CreateStockOpnameInput, UpsertOpnameItemInput } from '../validators/stock-opname';

const opnameBase = `${apiRoutes.inventory}/opname`;

export type StockOpnamesPage = { items: StockOpnameListItem[]; meta: PageMeta };
export type CountableVariantsPage = { items: CountableVariant[]; meta: PageMeta };

export function useStockOpnamesQuery(page: number, pageSize: number) {
  return useQuery({
    queryKey: stockOpnameKeys.list({ page, pageSize }),
    queryFn: async () => {
      const result = await apiFetch<StockOpnamesPage>(opnameBase, { params: { page, pageSize } });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useStockOpnameQuery(id: string | null, enabled = true) {
  return useQuery({
    queryKey: stockOpnameKeys.detail(id ?? 'unknown'),
    queryFn: async () => {
      const result = await apiFetch<StockOpnameDetail>(`${opnameBase}/${id}`);
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    enabled: Boolean(id) && enabled,
  });
}

/** Variants to add to a count (debounced search by SKU/name). */
export function useCountableVariantsQuery(
  q: string,
  page: number,
  pageSize: number,
  enabled = true,
) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: stockOpnameKeys.variants(trimmed, page, pageSize),
    queryFn: async () => {
      const result = await apiFetch<CountableVariantsPage>(`${opnameBase}/variants`, {
        params: { page, pageSize, ...(trimmed ? { q: trimmed } : {}) },
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Resolve a scanned/typed code (barcode/SKU) to one variant to count. */
export function useResolveCountableMutation() {
  return useMutation({
    mutationFn: async (code: string) => {
      const result = await apiFetch<CountableVariant | null>(`${opnameBase}/variants/resolve`, {
        params: { code },
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
  });
}

export function useCreateOpnameMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateStockOpnameInput) => {
      const result = await apiFetch<StockOpnameDetail>(opnameBase, { method: 'POST', body: input });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: stockOpnameKeys.all });
    },
  });
}

/** The item edits return the full detail; seed it into the cache + refresh the lists (any page). */
function seedDetail(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
  detail: StockOpnameDetail,
) {
  queryClient.setQueryData(stockOpnameKeys.detail(id), detail);
  void queryClient.invalidateQueries({ queryKey: ['stock-opname', 'list'] });
}

export function useUpsertOpnameItemMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertOpnameItemInput) => {
      const result = await apiFetch<StockOpnameDetail>(`${opnameBase}/${id}/items`, {
        method: 'POST',
        body: input,
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: (detail) => seedDetail(queryClient, id, detail),
  });
}

export function useRemoveOpnameItemMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const result = await apiFetch<StockOpnameDetail>(`${opnameBase}/${id}/items/${itemId}`, {
        method: 'DELETE',
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: (detail) => seedDetail(queryClient, id, detail),
  });
}

export function useCompleteOpnameMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await apiFetch<StockOpnameDetail>(`${opnameBase}/${id}/complete`, {
        method: 'POST',
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: (detail) => {
      queryClient.setQueryData(stockOpnameKeys.detail(id), detail);
      void queryClient.invalidateQueries({ queryKey: stockOpnameKeys.all });
      // Posting corrects real stock — refresh inventory views too.
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useCancelOpnameMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await apiFetch<StockOpnameDetail>(`${opnameBase}/${id}/cancel`, {
        method: 'POST',
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: (detail) => {
      queryClient.setQueryData(stockOpnameKeys.detail(id), detail);
      void queryClient.invalidateQueries({ queryKey: stockOpnameKeys.all });
    },
  });
}
