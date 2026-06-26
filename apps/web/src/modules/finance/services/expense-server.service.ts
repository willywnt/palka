import 'server-only';

import { prisma } from '@falka/db';
import type { Expense, Prisma } from '@prisma/client';

import { appLogger } from '@/lib/logger';
import { auditService } from '@/modules/audit/services/audit.service';

import { ExpenseError } from '../errors/expense-errors';
import type { ExpenseDetail, ExpenseListItem } from '../types';
import type {
  CreateExpenseInput,
  ListExpensesQuery,
  UpdateExpenseInput,
} from '../validators/expense';

function mapExpense(row: Expense): ExpenseListItem {
  return {
    id: row.id,
    category: row.category,
    amount: row.amount.toString(),
    date: row.date.toISOString(),
    note: row.note,
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
