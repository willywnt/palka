import 'server-only';

import { prisma } from '@falka/db';
import type { Budget } from '@prisma/client';

import { auditService } from '@/modules/audit/services/audit.service';

import { expenseServerService } from './expense-server.service';
import type { BudgetListItem, BudgetReport, BudgetReportRow } from '../types';
import type { UpsertBudgetsInput } from '../validators/budget';
import { monthBounds, round2 } from '../utils/period';

function mapBudget(row: Budget): BudgetListItem {
  return { category: row.category, amount: row.amount.toString() };
}

/**
 * Monthly opex budgets per category (set once, apply every month) + the budget-vs-actual view
 * for the Net P&L page. A budget is config, not a ledger row — one per (org, category), unset by
 * deleting. Org-scoped, gated by the finance.* keys at the route layer.
 */
export class BudgetServerService {
  async listBudgets(organizationId: string): Promise<BudgetListItem[]> {
    const rows = await prisma.budget.findMany({
      where: { organizationId },
      orderBy: { category: 'asc' },
    });
    return rows.map(mapBudget);
  }

  /** Set each given category's monthly budget; amount 0 deletes (unsets) the budget. */
  async upsertBudgets(
    organizationId: string,
    actorUserId: string,
    input: UpsertBudgetsInput,
  ): Promise<BudgetListItem[]> {
    for (const budget of input.budgets) {
      if (budget.amount <= 0) {
        await prisma.budget.deleteMany({ where: { organizationId, category: budget.category } });
      } else {
        await prisma.budget.upsert({
          where: { organizationId_category: { organizationId, category: budget.category } },
          create: {
            userId: actorUserId,
            organizationId,
            category: budget.category,
            amount: budget.amount,
          },
          update: { amount: budget.amount },
        });
      }
    }

    void auditService.log({
      organizationId,
      actorUserId,
      action: 'finance.budgets_updated',
      resource: 'budget',
      metadata: { count: String(input.budgets.length) },
    });

    return this.listBudgets(organizationId);
  }

  /** Budget vs this month's actual spend, per budgeted category (most-used first). */
  async getBudgetReport(organizationId: string, month: string): Promise<BudgetReport> {
    const budgets = await prisma.budget.findMany({ where: { organizationId } });
    if (budgets.length === 0) {
      return { month, rows: [], totalBudget: '0.00', totalActual: '0.00' };
    }

    const { from, to } = monthBounds(month);
    const actuals = await expenseServerService.sumByCategoryForRange(organizationId, from, to);
    const actualByCategory = new Map(actuals.map((row) => [row.category, row.amount]));

    let totalBudget = 0;
    let totalActual = 0;
    const rows: BudgetReportRow[] = budgets.map((budget) => {
      const budgetAmount = Number(budget.amount);
      const actual = actualByCategory.get(budget.category) ?? 0;
      totalBudget += budgetAmount;
      totalActual += actual;
      return {
        category: budget.category,
        budget: budgetAmount.toFixed(2),
        actual: actual.toFixed(2),
        remaining: round2(budgetAmount - actual).toFixed(2),
        pctUsed: budgetAmount > 0 ? round2((actual / budgetAmount) * 100) : null,
        over: actual > budgetAmount,
      };
    });
    rows.sort((a, b) => (b.pctUsed ?? 0) - (a.pctUsed ?? 0));

    return {
      month,
      rows,
      totalBudget: totalBudget.toFixed(2),
      totalActual: totalActual.toFixed(2),
    };
  }
}

export const budgetServerService = new BudgetServerService();
