import { z } from 'zod';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

/** Listing table filters (server-side). */
export const LISTING_STATUS_FILTERS = [
  'mapped',
  'unmapped',
  'needs_review',
  'sync_failed',
] as const;
export type ListingStatusFilter = (typeof LISTING_STATUS_FILTERS)[number];

/**
 * Query for the paginated listings table: page/size, a `search` over external
 * SKU / name / id (case-insensitive), and a `status` lens over the mapping.
 */
export const listListingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  search: z.string().trim().min(1).max(64).optional(),
  status: z.enum(LISTING_STATUS_FILTERS).optional(),
});

export type ListListingsQuery = z.infer<typeof listListingsQuerySchema>;
