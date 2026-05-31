'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/fetch-client';
import { formatApiErrorMessage } from '@/lib/api/format-api-error';
import { apiRoutes } from '@/lib/api/routes';

import type { MarketplaceMappingListItemDto } from '../dto/mapping.dto';
import type { ImportProductsResultDto, MarketplaceProductListItemDto } from '../dto/product.dto';
import type { CreateMappingInput } from '../validators/mapping';

export const marketplaceMappingKeys = {
  all: ['marketplace-mappings'] as const,
  products: (accountId: string, filters: Record<string, unknown>) =>
    ['marketplace-products', accountId, filters] as const,
  mappings: (filters: Record<string, unknown>) =>
    ['marketplace-mappings', 'list', filters] as const,
  productDetail: (accountId: string, productId: string) =>
    ['marketplace-product', accountId, productId] as const,
};

export function useMarketplaceProductsQuery(
  accountId: string | null,
  filters: { search?: string; unmappedOnly?: boolean; page?: number; pageSize?: number },
) {
  return useQuery({
    queryKey: marketplaceMappingKeys.products(accountId ?? 'none', filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.unmappedOnly) params.set('unmappedOnly', 'true');
      if (filters.page) params.set('page', String(filters.page));
      if (filters.pageSize) params.set('pageSize', String(filters.pageSize));

      const result = await apiFetch<MarketplaceProductListItemDto[]>(
        `${apiRoutes.marketplace}/${accountId}/products?${params.toString()}`,
      );

      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return { items: result.data, meta: result.meta };
    },
    enabled: Boolean(accountId),
  });
}

export function useMarketplaceMappingsQuery(filters: {
  marketplaceAccountId?: string;
  mappingStatus?: string;
  search?: string;
  page?: number;
}) {
  return useQuery({
    queryKey: marketplaceMappingKeys.mappings(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.marketplaceAccountId) {
        params.set('marketplaceAccountId', filters.marketplaceAccountId);
      }
      if (filters.mappingStatus) params.set('mappingStatus', filters.mappingStatus);
      if (filters.search) params.set('search', filters.search);
      if (filters.page) params.set('page', String(filters.page));

      const result = await apiFetch<MarketplaceMappingListItemDto[]>(
        `${apiRoutes.marketplaceMappings}?${params.toString()}`,
      );

      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return { items: result.data, meta: result.meta };
    },
  });
}

export function useImportMarketplaceProductsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ accountId, dryRun }: { accountId: string; dryRun?: boolean }) => {
      const result = await apiFetch<ImportProductsResultDto>(
        `${apiRoutes.marketplace}/${accountId}/products/import`,
        { method: 'POST', body: { dryRun: dryRun ?? false } },
      );

      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: marketplaceMappingKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['marketplace-products'] });
    },
  });
}

export function useCreateMappingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateMappingInput) => {
      const result = await apiFetch<MarketplaceMappingListItemDto>(apiRoutes.marketplaceMappings, {
        method: 'POST',
        body: input,
      });

      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: marketplaceMappingKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['marketplace-products'] });
    },
  });
}

export function useRemoveMappingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mappingId: string) => {
      const result = await apiFetch<{ removed: boolean }>(
        `${apiRoutes.marketplaceMappings}/${mappingId}`,
        { method: 'DELETE' },
      );

      if (!result.success) throw new Error(formatApiErrorMessage(result.error));
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: marketplaceMappingKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['marketplace-products'] });
    },
  });
}
