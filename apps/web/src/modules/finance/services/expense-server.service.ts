import 'server-only';

import { prisma } from '@falka/db';
import type { Expense, ExpenseCategory, Prisma } from '@prisma/client';

import { appLogger } from '@/lib/logger';
import { auditService } from '@/modules/audit/services/audit.service';

import { ExpenseError } from '../errors/expense-errors';
import type { ExpenseDetail, ExpenseLine, ExpenseListItem, ExpenseSource } from '../types';
import type {
  CreateExpenseInput,
  ListExpensesQuery,
  UpdateExpenseInput,
} from '../validators/expense';

/** Derive how the row entered the ledger: auto-derived fee → recurring template → manual. */
function expenseSource(row: Expense): ExpenseSource {
  if (row.autoSourceKey) return 'AUTO_FEE';
  if (row.templateId) return 'RECURRING';
  return 'MANUAL';
}

function mapExpense(row: Expense): ExpenseListItem {
  return {
    id: row.id,
    category: row.category,
    amount: row.amount.toString(),
    date: row.date.toISOString(),
    note: row.note,
    source: expenseSource(row),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Operating-expense ledger behind the True Net P&L. Org-scoped, soft-deleted so the
 * report history survives a deletion. Sensitive (money) — gated by the finance.* keys at
 * the route layer; this service only enforces org ownership.
 */
export class ExpenseServerService {
  /** Non-deleted expenses (newest incurred first), optionally filtered by date range + category. */
  async listExpenses(organizationId: string, query: ListExpensesQuery): Promise<ExpenseListItem[]> {
    const where: Prisma.ExpenseWhereInput = {
      organizationId,
      deletedAt: null,
      ...(query.category ? { category: query.category } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    const rows = await prisma.expense.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(mapExpense);
  }

  async getExpense(organizationId: string, id: string): Promise<ExpenseDetail> {
    return mapExpense(await this.getOwnedExpense(id, organizationId));
  }

  /** Raw expense lines in a date range — feeds the Net P&L report's category/period aggregation. */
  async listExpenseLines(organizationId: string, from: Date, to: Date): Promise<ExpenseLine[]> {
    const rows = await prisma.expense.findMany({
      where: { organizationId, deletedAt: null, date: { gte: from, lte: to } },
      select: { date: true, category: true, amount: true },
    });
    return rows.map((row) => ({
      date: row.date,
      category: row.category,
      amount: Number(row.amount),
    }));
  }

  /** Σ live expenses per category in a date range — the "actual" for budget-vs-actual. */
  async sumByCategoryForRange(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<{ category: ExpenseCategory; amount: number }[]> {
    const rows = await prisma.expense.groupBy({
      by: ['category'],
      where: { organizationId, deletedAt: null, date: { gte: from, lte: to } },
      _sum: { amount: true },
    });
    return rows.map((row) => ({ category: row.category, amount: Number(row._sum.amount ?? 0) }));
  }

  async createExpense(
    organizationId: string,
    actorUserId: string,
    input: CreateExpenseInput,
  ): Promise<ExpenseDetail> {
    const row = await prisma.expense.create({
      data: {
        userId: actorUserId,
        organizationId,
        category: input.category,
        amount: input.amount,
        date: input.date,
        note: input.note ?? null,
      },
    });

    appLogger.info('finance.expense.created', { organizationId, expenseId: row.id });
    void auditService.log({
      organizationId,
      actorUserId,
      action: 'expense.created',
      resource: 'expense',
      resourceId: row.id,
      metadata: { category: row.category, amount: row.amount.toString() },
    });

    return mapExpense(row);
  }

  async updateExpense(
    organizationId: string,
    actorUserId: string,
    id: string,
    input: UpdateExpenseInput,
  ): Promise<ExpenseDetail> {
    await this.getOwnedExpense(id, organizationId);

    // Touch only the fields the caller sent.
    const data: Prisma.ExpenseUpdateInput = {};
    if (input.category !== undefined) data.category = input.category;
    if (input.amount !== undefined) data.amount = input.amount;
    if (input.date !== undefined) data.date = input.date;
    if (input.note !== undefined) data.note = input.note;

    const row = await prisma.expense.update({ where: { id }, data });

    appLogger.info('finance.expense.updated', { organizationId, expenseId: id });
    void auditService.log({
      organizationId,
      actorUserId,
      action: 'expense.updated',
      resource: 'expense',
      resourceId: id,
      metadata: { category: row.category, amount: row.amount.toString() },
    });

    return mapExpense(row);
  }

  /** Soft-delete: the row stays (deletedAt set) so report history is stable; lists filter it out. */
  async deleteExpense(
    organizationId: string,
    actorUserId: string,
    id: string,
  ): Promise<{ id: string }> {
    const expense = await this.getOwnedExpense(id, organizationId);
    if (expense.deletedAt) return { id };

    await prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } });

    appLogger.info('finance.expense.deleted', { organizationId, expenseId: id });
    void auditService.log({
      organizationId,
      actorUserId,
      action: 'expense.deleted',
      resource: 'expense',
      resourceId: id,
      metadata: { category: expense.category, amount: expense.amount.toString() },
    });

    return { id };
  }

  private async getOwnedExpense(id: string, organizationId: string): Promise<Expense> {
    const row = await prisma.expense.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!row) throw ExpenseError.notFound();
    return row;
  }
}

export const expenseServerService = new ExpenseServerService();
