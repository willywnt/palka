import { z } from 'zod';

const MAX_STOCK = 1_000_000_000;
/** Reorder-planning lead time, capped at a year. 0 = use the global default. */
const MAX_LEAD_DAYS = 365;

/**
 * Partial update for a variant's planning fields. For `leadTimeDays` /
 * `minOrderQty`, 0 means "unset" — the service maps it back to null (use the
 * global default / no minimum). At least one field must be present.
 */
export const updateVariantSchema = z
  .object({
    lowStockThreshold: z.coerce.number().int().nonnegative().max(MAX_STOCK).optional(),
    alertEnabled: z.boolean().optional(),
    leadTimeDays: z.coerce.number().int().nonnegative().max(MAX_LEAD_DAYS).optional(),
    minOrderQty: z.coerce.number().int().nonnegative().max(MAX_STOCK).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field must be provided.',
  });

export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;

export const variantRouteParamSchema = z.object({
  id: z.string().cuid(),
  variantId: z.string().cuid(),
});

export type VariantRouteParam = z.infer<typeof variantRouteParamSchema>;

/** Form-facing schema for the edit-variant dialog (0 = unset for planning fields). */
export const editVariantFormSchema = z.object({
  lowStockThreshold: z.coerce.number().int().nonnegative().max(MAX_STOCK),
  alertEnabled: z.boolean(),
  leadTimeDays: z.coerce.number().int().nonnegative().max(MAX_LEAD_DAYS),
  minOrderQty: z.coerce.number().int().nonnegative().max(MAX_STOCK),
});

export type EditVariantFormInput = z.infer<typeof editVariantFormSchema>;
