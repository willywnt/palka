import { z } from 'zod';

import { REORDER_BOUNDS, REORDER_DEFAULTS } from '../config';

/**
 * Query parameters for the reorder report. Every knob defaults to
 * `REORDER_DEFAULTS` and is clamped to `REORDER_BOUNDS`. Strings come in from the
 * URL, so each is coerced to an integer.
 */
export const reorderReportQuerySchema = z.object({
  windowDays: z.coerce
    .number()
    .int()
    .min(REORDER_BOUNDS.windowDays.min)
    .max(REORDER_BOUNDS.windowDays.max)
    .default(REORDER_DEFAULTS.windowDays),
  leadTimeDays: z.coerce
    .number()
    .int()
    .min(REORDER_BOUNDS.leadTimeDays.min)
    .max(REORDER_BOUNDS.leadTimeDays.max)
    .default(REORDER_DEFAULTS.leadTimeDays),
  targetCoverDays: z.coerce
    .number()
    .int()
    .min(REORDER_BOUNDS.targetCoverDays.min)
    .max(REORDER_BOUNDS.targetCoverDays.max)
    .default(REORDER_DEFAULTS.targetCoverDays),
});

export type ReorderReportQuery = z.infer<typeof reorderReportQuerySchema>;
