import { z } from 'zod';

/** Decimal(12,2) caps the storable money value just under 10^10. */
const MAX_MONEY = 9_999_999_999;
/** Decimal(10,3) caps the storable weight just under 10^7. */
const MAX_WEIGHT = 9_999_999;
const MAX_STOCK = 1_000_000_000;
/** Reorder-planning lead time, capped at a year. 0 = use the global default. */
const MAX_LEAD_DAYS = 365;

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

export const createVariantSchema = z.object({
  sku: z.string().trim().min(1, 'SKU is required').max(64),
  name: z.string().trim().min(1, 'Variant name is required').max(200),
  barcode: optionalTrimmed(64),
  price: z.coerce.number().nonnegative('Price must be 0 or more').max(MAX_MONEY),
  cost: z.coerce.number().nonnegative().max(MAX_MONEY).optional(),
  weight: z.coerce.number().nonnegative().max(MAX_WEIGHT).optional(),
  lowStockThreshold: z.coerce.number().int().nonnegative().max(MAX_STOCK).default(0),
  alertEnabled: z.boolean().default(true),
  initialStock: z.coerce.number().int().nonnegative().max(MAX_STOCK).default(0),
  leadTimeDays: z.coerce.number().int().nonnegative().max(MAX_LEAD_DAYS).optional(),
  minOrderQty: z.coerce.number().int().nonnegative().max(MAX_STOCK).optional(),
});

export type CreateVariantInput = z.infer<typeof createVariantSchema>;

export const createProductSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(200),
  description: optionalTrimmed(2000),
  category: optionalTrimmed(100),
  variant: createVariantSchema,
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

/** Form-facing schema: plain (non-optional) fields the create-product dialog binds to. */
export const createProductFormSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(200),
  category: z.string().trim().max(100),
  description: z.string().trim().max(2000),
  variant: z.object({
    sku: z.string().trim().min(1, 'SKU is required').max(64),
    name: z.string().trim().min(1, 'Variant name is required').max(200),
    price: z.coerce.number().nonnegative('Price must be 0 or more').max(MAX_MONEY),
    cost: z.coerce.number().nonnegative('Cost must be 0 or more').max(MAX_MONEY),
    lowStockThreshold: z.coerce.number().int().nonnegative().max(MAX_STOCK),
    initialStock: z.coerce.number().int().nonnegative().max(MAX_STOCK),
    leadTimeDays: z.coerce.number().int().nonnegative().max(MAX_LEAD_DAYS),
    minOrderQty: z.coerce.number().int().nonnegative().max(MAX_STOCK),
  }),
});

export type CreateProductFormInput = z.infer<typeof createProductFormSchema>;

/** Form-facing schema for adding a variant to an existing product. */
export const addVariantFormSchema = z.object({
  sku: z.string().trim().min(1, 'SKU is required').max(64),
  name: z.string().trim().min(1, 'Variant name is required').max(200),
  price: z.coerce.number().nonnegative('Price must be 0 or more').max(MAX_MONEY),
  cost: z.coerce.number().nonnegative('Cost must be 0 or more').max(MAX_MONEY),
  lowStockThreshold: z.coerce.number().int().nonnegative().max(MAX_STOCK),
  initialStock: z.coerce.number().int().nonnegative().max(MAX_STOCK),
  leadTimeDays: z.coerce.number().int().nonnegative().max(MAX_LEAD_DAYS),
  minOrderQty: z.coerce.number().int().nonnegative().max(MAX_STOCK),
});

export type AddVariantFormInput = z.infer<typeof addVariantFormSchema>;
