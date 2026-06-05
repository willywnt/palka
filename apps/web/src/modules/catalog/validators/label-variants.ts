import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@olshop/config/limits';
import { z } from 'zod';

/** Filter + paginate the label studio list (matches SKU, barcode, variant or product name). */
export const labelVariantsQuerySchema = z.object({
  q: z.string().trim().max(100).optional().default(''),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type LabelVariantsQuery = z.infer<typeof labelVariantsQuerySchema>;
