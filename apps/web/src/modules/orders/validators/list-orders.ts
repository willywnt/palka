import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@falka/config/limits';
import { z } from 'zod';

/** Mirrors Prisma's OrderStatus — kept as literals so the validator stays client-safe. */
export const ORDER_STATUS_FILTER_VALUES = [
  'PENDING',
  'PAID',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
] as const;

/**
 * Page + filter params for the orders list (newest first; tenant-scoped in the
 * service). `search` matches order id / resi / buyer, case-insensitive.
 */
export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  search: z.string().trim().min(1).max(64).optional(),
  status: z.enum(ORDER_STATUS_FILTER_VALUES).optional(),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
