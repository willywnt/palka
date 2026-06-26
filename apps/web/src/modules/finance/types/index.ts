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
