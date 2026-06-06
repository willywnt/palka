import { DEFAULT_PAGE_SIZE } from '@olshop/config/limits';

import type { ListRecordingsQuery } from '../validators/list-recordings';
import { listRecordingsQuerySchema } from '../validators/list-recordings';

/** Next.js internal query params — not part of app filter state. */
const NEXT_INTERNAL_SEARCH_PARAMS = ['_rsc'] as const;

export const DEFAULT_RECORDINGS_LIBRARY_QUERY: Omit<ListRecordingsQuery, 'search'> = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  status: 'ALL',
  sortBy: 'createdAt',
  sortOrder: 'desc',
};

export function stripNextInternalSearchParams(searchParams: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(searchParams);

  for (const key of NEXT_INTERNAL_SEARCH_PARAMS) {
    params.delete(key);
  }

  return params;
}

export function toAppSearchParamsString(searchParams: URLSearchParams): string {
  return stripNextInternalSearchParams(searchParams).toString();
}

export function parseRecordingsLibrarySearchParams(searchParams: URLSearchParams): {
  query: Omit<ListRecordingsQuery, 'search'>;
  search: string;
} {
  const appParams = stripNextInternalSearchParams(searchParams);
  const raw = Object.fromEntries(appParams.entries());
  const parsed = listRecordingsQuerySchema.safeParse(raw);

  if (!parsed.success) {
    const search = appParams.get('search')?.trim() ?? '';
    return { query: DEFAULT_RECORDINGS_LIBRARY_QUERY, search };
  }

  const { search, ...query } = parsed.data;
  return {
    query,
    search: search ?? '',
  };
}
export function serializeRecordingsLibrarySearchParams(
  query: Omit<ListRecordingsQuery, 'search'>,
  search: string,
): string {
  const params = new URLSearchParams();
  const trimmedSearch = search.trim();

  if (trimmedSearch) params.set('search', trimmedSearch);
  if (query.status !== 'ALL') params.set('status', query.status);
  if (query.page > 1) params.set('page', String(query.page));
  if (query.pageSize !== DEFAULT_PAGE_SIZE) {
    params.set('pageSize', String(query.pageSize));
  }
  if (query.sortBy !== 'createdAt') params.set('sortBy', query.sortBy);
  if (query.sortOrder !== 'desc') params.set('sortOrder', query.sortOrder);

  return params.toString();
}
