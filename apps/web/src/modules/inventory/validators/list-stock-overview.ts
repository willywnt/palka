import { z } from 'zod';

export const listStockOverviewQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  lowStockOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export type ListStockOverviewQuery = z.infer<typeof listStockOverviewQuerySchema>;
