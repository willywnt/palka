'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';
import { inventoryKeys } from '@/modules/inventory/hooks/inventory-keys';

import { catalogKeys } from './catalog-keys';
import type { ProductDetail, ProductListItem, ProductVariantItem } from '../types';
import type { CreateProductInput, CreateVariantInput } from '../validators/create-product';
import type { ListProductsQuery } from '../validators/list-products';
import type { UpdateVariantInput } from '../validators/update-variant';

const LIST_PAGE_SIZE = 50;

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
    mutationFn: async (input: CreateVariantInput) => {
      const result = await apiFetch<ProductVariantItem>(
        `${apiRoutes.products}/${productId}/variants`,
        { method: 'POST', body: input },
      );

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
