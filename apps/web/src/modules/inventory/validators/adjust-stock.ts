import { StockLedgerReason } from '@prisma/client';
import { z } from 'zod';

import { isManualStockReason } from '../utils/stock-math';

export const adjustStockSchema = z.object({
  delta: z
    .number({ invalid_type_error: 'Delta must be a number' })
    .int('Delta must be a whole number')
    .refine((value) => value !== 0, 'Delta must not be zero'),
  reason: z
    .nativeEnum(StockLedgerReason)
    .refine(isManualStockReason, 'Unsupported manual stock reason'),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

/** Form-facing schema: a direction + positive quantity the dialog converts to a signed delta. */
export const adjustStockFormSchema = z.object({
  direction: z.enum(['add', 'remove']),
  quantity: z.coerce.number().int().positive('Quantity must be at least 1').max(1_000_000_000),
  reason: z
    .nativeEnum(StockLedgerReason)
    .refine(isManualStockReason, 'Unsupported manual stock reason'),
  note: z.string().trim().max(500),
});

export type AdjustStockFormInput = z.infer<typeof adjustStockFormSchema>;
