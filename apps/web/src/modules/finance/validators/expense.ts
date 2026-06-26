import { z } from 'zod';

/** Mirrors Prisma's ExpenseCategory — literals keep the validator client-safe. */
export const EXPENSE_CATEGORY_VALUES = [
  'ADVERTISING',
  'PACKAGING',
  'SHIPPING_SUBSIDY',
  'SALARY',
  'RENT',
  'MARKETPLACE_COMMISSION',
  'PAYMENT_FEE',
  'UTILITIES',
  'OTHER',
] as const;

/** 1 trillion rupiah ceiling — a sane bound, never a real opex line. */
const MAX_AMOUNT = 1_000_000_000_000;

export const createExpenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORY_VALUES),
  amount: z.number().positive().max(MAX_AMOUNT),
  date: z.coerce.date(),
  note: z.string().trim().max(500).nullable().optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const expenseIdSchema = z.object({ id: z.string().cuid() });

/** List filters: optional date range + a single category. */
export const listExpensesQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  category: z.enum(EXPENSE_CATEGORY_VALUES).optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
