import { z } from 'zod';

import { EXPENSE_CATEGORY_VALUES } from './expense';

/** 1 trillion rupiah ceiling — a sane bound, mirrors the expense ledger. */
const MAX_AMOUNT = 1_000_000_000_000;

/** Set/clear monthly budgets. amount 0 = unset (the row is deleted). */
export const upsertBudgetsSchema = z.object({
  budgets: z
    .array(
      z.object({
        category: z.enum(EXPENSE_CATEGORY_VALUES),
        amount: z.number().min(0).max(MAX_AMOUNT),
      }),
    )
    .min(1),
});

/** Budget-vs-actual for a month. `month` is "YYYY-MM". */
export const budgetReportQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Bulan harus format YYYY-MM.'),
});

export type UpsertBudgetsInput = z.infer<typeof upsertBudgetsSchema>;
export type BudgetReportQuery = z.infer<typeof budgetReportQuerySchema>;
