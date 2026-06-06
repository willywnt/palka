'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';
import type { PageMeta } from '@/hooks/use-pagination';
import { inventoryKeys } from '@/modules/inventory/hooks/inventory-keys';

import { compressImage } from '../utils/compress-image';
import { catalogKeys } from './catalog-keys';
import type {
  BundleDetail,
  BundleListItem,
  DeletionBlockers,
  LabelVariant,
  ProductDetail,
  ProductListItem,
  ProductVariantItem,
} from '../types';
import type { CreateProductInput } from '../validators/create-product';
import type { CreateVariantInput } from '../validators/variant';
import type { ListProductsQuery } from '../validators/list-products';
import type { UpdateVariantInput } from '../validators/update-variant';
import type { SetBundleInput } from '../validators/bundle';

const LIST_PAGE_SIZE = 50;

/** A page of label-studio variants (mirror of the server's PaginatedResult). */
export type LabelVariantsPage = {
  items: LabelVariant[];
  meta: PageMeta;
};

/** A page of bundles for the dedicated Bundles list. */
export type BundlesPage = {
  items: BundleListItem[];
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

/** Paginated list of bundles (debounced search by SKU / name / product name). */
export function useBundlesQuery(q: string, page: number, pageSize: number) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: catalogKeys.bundles(trimmed, page, pageSize),
    queryFn: async () => {
      const result = await apiFetch<BundlesPage>(apiRoutes.bundles, {
        params: { page, pageSize, ...(trimmed ? { q: trimmed } : {}) },
      });
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useBundleQuery(productId: string, variantId: string | null, enabled = true) {
  return useQuery({
    queryKey: catalogKeys.bundle(variantId ?? 'unknown'),
    queryFn: async () => {
      const result = await apiFetch<BundleDetail>(
        `${apiRoutes.products}/${productId}/variants/${variantId}/bundle`,
      );
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    enabled: Boolean(variantId) && enabled,
  });
}

export function useSetBundleMutation(productId: string, variantId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SetBundleInput) => {
      const result = await apiFetch<BundleDetail>(
        `${apiRoutes.products}/${productId}/variants/${variantId}/bundle`,
        { method: 'PUT', body: input },
      );
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.bundle(variantId) });
      void queryClient.invalidateQueries({ queryKey: catalogKeys.detail(productId) });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
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

/**
 * Preflight a delete: fetch the hard blockers (mapping / reserved / incoming /
 * open return) + soft warnings. `variantIds` null = the whole product.
 */
export function useDeletionBlockersQuery(
  productId: string,
  variantIds: string[] | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: catalogKeys.deletionBlockers(productId, variantIds),
    queryFn: async () => {
      const result = await apiFetch<DeletionBlockers>(
        `${apiRoutes.products}/${productId}/deletion-blockers`,
        variantIds && variantIds.length > 0 ? { params: { variantIds: variantIds.join(',') } } : {},
      );

      if (!result.success) {
        throw new Error(formatApiErrorMessage(result.error));
      }

      return result.data;
    },
    enabled,
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

/** Compress an image, presign + PUT it to R2, then save it as a variant's photo. */
export function useUploadVariantImageMutation(productId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ variantId, file }: { variantId: string; file: File }) => {
      const blob = await compressImage(file);

      const presign = await apiFetch<{
        uploadUrl: string;
        storageKey: string;
        publicUrl: string;
        expiresAt: string;
      }>(apiRoutes.uploadsPresignImage, {
        method: 'POST',
        body: { mimeType: blob.type, fileSizeBytes: blob.size },
      });
      if (!presign.success) throw new Error(formatApiErrorMessage(presign.error));

      const put = await fetch(presign.data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': blob.type },
        body: blob,
      });
      if (!put.ok) {
        throw new Error('Upload to storage failed. Check the R2 bucket CORS allows PUT.');
      }

      const result = await apiFetch<ProductDetail>(
        `${apiRoutes.products}/${productId}/variants/${variantId}/image`,
        {
          method: 'PATCH',
          body: { imageKey: presign.data.storageKey, imageUrl: presign.data.publicUrl },
        },
      );
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
    },
  });
}

/** Remove a variant's photo (clears the fields + deletes the R2 object). */
export function useRemoveVariantImageMutation(productId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variantId: string) => {
      const result = await apiFetch<ProductDetail>(
        `${apiRoutes.products}/${productId}/variants/${variantId}/image`,
        { method: 'DELETE' },
      );
      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
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
