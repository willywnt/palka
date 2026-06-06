import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@olshop/config/limits';
import { z } from 'zod';

/** Components that make up a bundle/kit. An empty array clears the bundle. */
export const setBundleSchema = z.object({
  components: z
    .array(
      z.object({
        componentVariantId: z.string().min(1),
        quantity: z.number().int().positive().max(1000),
      }),
    )
    .max(50),
});

export type SetBundleInput = z.infer<typeof setBundleSchema>;

/** Filter + paginate the bundles list (matches the bundle's SKU / name / product name). */
export const listBundlesQuerySchema = z.object({
  q: z.string().trim().max(100).optional().default(''),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type ListBundlesQuery = z.infer<typeof listBundlesQuerySchema>;
