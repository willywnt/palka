import type { ExpenseCategory } from '@prisma/client';

export type { ExpenseCategory };

/** id-ID labels for each operating-expense category (Select options + report rows). */
export const EXPENSE_CATEGORY_LABELS = {
  ADVERTISING: 'Iklan',
  PACKAGING: 'Packaging',
  SHIPPING_SUBSIDY: 'Subsidi ongkir',
  SALARY: 'Gaji',
  RENT: 'Sewa',
  MARKETPLACE_COMMISSION: 'Komisi marketplace',
  PAYMENT_FEE: 'Biaya admin/QRIS',
  UTILITIES: 'Utilitas',
  OTHER: 'Lainnya',
} satisfies Record<ExpenseCategory, string>;

/** Categories in display order (Select + report breakdown). */
export const EXPENSE_CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];

/** A single operating-expense row (money as a decimal string, dates as ISO). */
export type ExpenseListItem = {
  id: string;
  category: ExpenseCategory;
  amount: string;
  /** When the expense was incurred (ISO). */
  date: string;
  note: string | null;
  createdAt: string;
};

export type ExpenseDetail = ExpenseListItem;

/** A raw expense row for report aggregation (numbers, not strings). */
export type ExpenseLine = {
  date: Date;
  category: ExpenseCategory;
  amount: number;
};

/** A recurring-expense template (sewa/gaji) — generates monthly Expense rows, never a ledger row itself. */
export type ExpenseTemplateListItem = {
  id: string;
  category: ExpenseCategory;
  amount: string;
  /** 1..31 — the nominal day of month for the generated expense (clamped to the month). */
  dayOfMonth: number;
  note: string | null;
  isActive: boolean;
  createdAt: string;
};

export type ExpenseTemplateDetail = ExpenseTemplateListItem;

/** Result of generating a month's recurring expenses from the active templates. */
export type GenerateRecurringResult = {
  month: string;
  created: number;
  skipped: number;
  total: number;
};
