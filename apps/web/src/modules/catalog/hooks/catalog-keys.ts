import type { ListProductsQuery } from '../validators/list-products';

/**
 * Single query-key hierarchy for the catalog domain. One root (`all`) means a
 * broad invalidation refreshes every product view, while list and detail can be
 * invalidated in isolation.
 */
export const catalogKeys = {
  all: ['catalog'] as const,
  products: ['catalog', 'products'] as const,
  list: (query: ListProductsQuery) => ['catalog', 'products', 'list', query] as const,
  detail: (id: string) => ['catalog', 'products', 'detail', id] as const,
  deletionBlockers: (id: string, variantIds: string[] | null) =>
    ['catalog', 'products', 'deletion-blockers', id, variantIds ?? 'all'] as const,
  labelVariants: (q: string, page: number, pageSize: number) =>
    ['catalog', 'label-variants', q, page, pageSize] as const,
  bundles: (q: string, status: string, page: number, pageSize: number) =>
    ['catalog', 'bundles', q, status, page, pageSize] as const,
  bundleDetail: (id: string) => ['catalog', 'bundle', id] as const,
  bundleLabels: (q: string, page: number, pageSize: number) =>
    ['catalog', 'bundle-labels', q, page, pageSize] as const,
};
