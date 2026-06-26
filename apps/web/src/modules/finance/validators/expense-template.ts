import { z } from 'zod';

import { EXPENSE_CATEGORY_VALUES } from './expense';

/** 1 trillion rupiah ceiling — a sane bound, mirrors the expense ledger. */
const MAX_AMOUNT = 1_000_000_000_000;

export const createExpenseTemplateSchema = z.object({
  category: z.enum(EXPENSE_CATEGORY_VALUES),
  amount: z.number().positive().max(MAX_AMOUNT),
  /** Nominal day of month (clamped to the target month at generation, e.g. 31 → 28 in Feb). */
  dayOfMonth: z.number().int().min(1).max(31),
  note: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const updateExpenseTemplateSchema = createExpenseTemplateSchema.partial();

export const expenseTemplateIdSchema = z.object({ id: z.string().cuid() });

/** Generate a month's expenses from the active templates. `month` is "YYYY-MM". */
export const generateRecurringSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Bulan harus format YYYY-MM.'),
});

export type CreateExpenseTemplateInput = z.infer<typeof createExpenseTemplateSchema>;
export type UpdateExpenseTemplateInput = z.infer<typeof updateExpenseTemplateSchema>;
export type GenerateRecurringInput = z.infer<typeof generateRecurringSchema>;
