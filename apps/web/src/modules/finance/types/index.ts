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

/** How an expense entered the ledger — drives the "Berulang"/"Otomatis" flag in the list. */
export type ExpenseSource = 'MANUAL' | 'RECURRING' | 'AUTO_FEE';

/** Labels for the non-manual sources (manual rows show no flag). */
export const EXPENSE_SOURCE_LABELS: Record<Exclude<ExpenseSource, 'MANUAL'>, string> = {
  RECURRING: 'Berulang',
  AUTO_FEE: 'Otomatis',
};

/** A single operating-expense row (money as a decimal string, dates as ISO). */
export type ExpenseListItem = {
  id: string;
  category: ExpenseCategory;
  amount: string;
  /** When the expense was incurred (ISO). */
  date: string;
  note: string | null;
  /** Manual entry, generated from a recurring template, or an auto-derived fee. */
  source: ExpenseSource;
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

/** A marketplace connection's commission rate, for the fee-config UI. */
export type ConnectionFeeRate = {
  connectionId: string;
  shopName: string;
  provider: string;
  /** Percent string (e.g. "5.00"); "0" = no auto commission. */
  commissionRate: string;
};

/** Auto-derived-fee config: the org QRIS rate + each connection's commission rate (percent strings). */
export type FeeConfig = {
  qrisFeeRate: string;
  connections: ConnectionFeeRate[];
};

/** Result of deriving a month's fee estimates (amounts as decimal strings). */
export type DeriveFeesResult = {
  month: string;
  /** QRIS payment fee: `base` = gross QRIS sales, `fee` = base × rate. */
  qris: { base: string; rate: string; fee: string };
  /** Per-connection commission: `base` = fulfilled revenue, `fee` = base × rate. */
  commissions: {
    connectionId: string;
    shopName: string;
    base: string;
    rate: string;
    fee: string;
  }[];
  /** Σ of all derived fees written/updated this run. */
  totalFee: string;
};

/** A monthly opex budget for one category (set once, applies every month). */
export type BudgetListItem = {
  category: ExpenseCategory;
  amount: string;
};

/** One category's budget vs this month's actual spend. */
export type BudgetReportRow = {
  category: ExpenseCategory;
  budget: string;
  actual: string;
  /** budget − actual (negative when over budget). */
  remaining: string;
  /** actual / budget × 100 (null when budget is 0). */
  pctUsed: number | null;
  over: boolean;
};

/** Budget-vs-actual for a month — budgeted categories, most-used first. */
export type BudgetReport = {
  month: string;
  rows: BudgetReportRow[];
  totalBudget: string;
  totalActual: string;
};
