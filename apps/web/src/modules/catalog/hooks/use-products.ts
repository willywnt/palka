'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';
import type { PageMeta } from '@/hooks/use-pagination';
import { inventoryKeys } from '@/modules/inventory/hooks/inventory-keys';

import { catalogKeys } from './catalog-keys';
import type { LabelVariant, ProductDetail, ProductListItem, ProductVariantItem } from '../types';
import type { CreateProductInput } from '../validators/create-product';
import type { CreateVariantInput } from '../validators/variant';
import type { ListProductsQuery } from '../validators/list-products';
import type { UpdateVariantInput } from '../validators/update-variant';

const LIST_PAGE_SIZE = 50;

/** A page of label-studio variants (mirror of the server's PaginatedResult). */
export type LabelVariantsPage = {
  items: LabelVariant[];
  meta: PageMeta;
};

function listQuery(search?: string): ListProductsQuery {
  return { page: 1, pageSize: LIST_PAGE_SIZE, search: search || undefined };
}

export function useProductsQuery(search?: string) {
  return useQuery({
    queryKey: catalogKeys.list(listQuery(search)),
    queryFn: async () => {
      const result = await apiFetch<ProductListItem[]>(apiRoutes.products, {
        params: { page: 1, pageSize: LIST_PAGE_SIZE, ...(search ? { search } : {}) },
      });

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
  });
}

/** A paginated page of label-studio variants (debounced search by SKU/barcode/name). */
export function useLabelVariantsQuery(q: string, page: number, pageSize: number) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: catalogKeys.labelVariants(trimmed, page, pageSize),
    queryFn: async () => {
      const result = await apiFetch<LabelVariantsPage>(`${apiRoutes.products}/variants`, {
        params: { page, pageSize, ...(trimmed ? { q: trimmed } : {}) },
      });

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    // Keep the current page visible while the next one loads (smoother paging).
    placeholderData: keepPreviousData,
  });
}

/** Stamp the label-printed time for variants (after a print) and refresh views. */
export function useMarkLabelsPrintedMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variantIds: string[]) => {
      const result = await apiFetch<{ ok: boolean }>(`${apiRoutes.products}/variants/printed`, {
        method: 'POST',
        body: { variantIds },
      });

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useProductQuery(id: string | null, enabled = true) {
  return useQuery({
    queryKey: catalogKeys.detail(id ?? 'unknown'),
    queryFn: async () => {
      const result = await apiFetch<ProductDetail>(`${apiRoutes.products}/${id}`);

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    enabled: Boolean(id) && enabled,
  });
}

export function useCreateProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateProductInput) => {
      const result = await apiFetch<ProductDetail>(apiRoutes.products, {
        method: 'POST',
        body: input,
      });

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
    },
  });
}

export function useAddVariantMutation(productId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variants: CreateVariantInput[]) => {
      const result = await apiFetch<ProductVariantItem[]>(
        `${apiRoutes.products}/${productId}/variants`,
        { method: 'POST', body: { variants } },
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
      // New leaves create inventory rows — refresh inventory-backed views too.
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useUpdateVariantMutation(productId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ variantId, input }: { variantId: string; input: UpdateVariantInput }) => {
      const result = await apiFetch<ProductVariantItem>(
        `${apiRoutes.products}/${productId}/variants/${variantId}`,
        { method: 'PATCH', body: input },
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
      // Planning fields feed the reorder report — refresh it too.
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

/** Soft-delete one variant or a whole group (its leaf ids) and refresh views. */
export function useDeleteVariantsMutation(productId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variantIds: string[]) => {
      const result = await apiFetch<{ ok: boolean }>(
        `${apiRoutes.products}/${productId}/variants`,
        { method: 'DELETE', body: { variantIds } },
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useDeleteProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (productId: string) => {
      const result = await apiFetch<{ id: string }>(`${apiRoutes.products}/${productId}`, {
        method: 'DELETE',
      });

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
    },
  });
}
