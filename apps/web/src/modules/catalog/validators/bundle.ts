import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@olshop/config/limits';
import { z } from 'zod';

/** Decimal(12,2) caps the storable money value just under 10^10. */
const MAX_MONEY = 9_999_999_999;

/** The component variants a bundle groups, with how many of each go into one bundle. */
export const bundleItemsSchema = z
  .array(
    z.object({
      productVariantId: z.string().min(1),
      quantity: z.number().int().positive().max(1000),
    }),
  )
  .min(1, 'Add at least one component')
  .max(50);

const bundleNameSchema = z.string().trim().min(1, 'Bundle name is required').max(200);
const bundleSkuSchema = z.string().trim().min(1, 'SKU is required').max(64);
const bundleBarcodeSchema = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((value) => (value === '' ? undefined : value));
const bundlePriceSchema = z.coerce.number().nonnegative('Price must be 0 or more').max(MAX_MONEY);

/** Create a bundle: its own identity + the component variants it groups. */
export const createBundleSchema = z.object({
  name: bundleNameSchema,
  sku: bundleSkuSchema,
  barcode: bundleBarcodeSchema,
  price: bundlePriceSchema,
  items: bundleItemsSchema,
});

export type CreateBundleInput = z.infer<typeof createBundleSchema>;

/** Update a bundle: identity fields + active flag + replace its component set. */
export const updateBundleSchema = z.object({
  name: bundleNameSchema,
  sku: bundleSkuSchema,
  barcode: bundleBarcodeSchema,
  price: bundlePriceSchema,
  isActive: z.boolean(),
  items: bundleItemsSchema,
});

export type UpdateBundleInput = z.infer<typeof updateBundleSchema>;

/** Filter + paginate the bundles list (matches the bundle's SKU / name). */
export const listBundlesQuerySchema = z.object({
  q: z.string().trim().max(100).optional().default(''),
  /** Triage filter on the "available" (buildable) count; summary counts ignore this. */
  status: z.enum(['all', 'available', 'unavailable']).default('all'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type ListBundlesQuery = z.infer<typeof listBundlesQuerySchema>;

/** Resolve a scanned code (barcode or SKU) to a bundle. */
export const resolveBundleQuerySchema = z.object({
  code: z.string().trim().min(1).max(64),
});

/** Stamp print time for the given bundles (label studio). */
export const markBundleLabelsPrintedSchema = z.object({
  bundleIds: z.array(z.string().min(1)).min(1).max(500),
});

export type MarkBundleLabelsPrintedInput = z.infer<typeof markBundleLabelsPrintedSchema>;
