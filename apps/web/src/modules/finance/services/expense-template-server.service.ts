import 'server-only';

import { prisma } from '@falka/db';
import type { ExpenseTemplate, Prisma } from '@prisma/client';

import { appLogger } from '@/lib/logger';
import { auditService } from '@/modules/audit/services/audit.service';

import { ExpenseError } from '../errors/expense-errors';
import type {
  ExpenseTemplateDetail,
  ExpenseTemplateListItem,
  GenerateRecurringResult,
} from '../types';
import type {
  CreateExpenseTemplateInput,
  UpdateExpenseTemplateInput,
} from '../validators/expense-template';

function mapTemplate(row: ExpenseTemplate): ExpenseTemplateListItem {
  return {
    id: row.id,
    category: row.category,
    amount: row.amount.toString(),
    dayOfMonth: row.dayOfMonth,
    note: row.note,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Recurring-expense templates (monthly sewa / gaji). A template is NOT a ledger entry — it
 * only generates {@link prisma.expense} rows when {@link generateForMonth} runs ("Buat bulan
 * ini"; auto-generation on the 1st is the VPS-era worker step). Org-scoped, soft-deleted,
 * gated by the finance.* keys at the route layer.
 */
export class ExpenseTemplateServerService {
  /** Non-deleted templates (active first, then newest). */
  async listTemplates(organizationId: string): Promise<ExpenseTemplateListItem[]> {
    const rows = await prisma.expenseTemplate.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(mapTemplate);
  }

  async createTemplate(
    organizationId: string,
    actorUserId: string,
    input: CreateExpenseTemplateInput,
  ): Promise<ExpenseTemplateDetail> {
    const row = await prisma.expenseTemplate.create({
      data: {
        userId: actorUserId,
        organizationId,
        category: input.category,
        amount: input.amount,
        dayOfMonth: input.dayOfMonth,
        note: input.note ?? null,
        isActive: input.isActive ?? true,
      },
    });

    appLogger.info('finance.expenseTemplate.created', { organizationId, templateId: row.id });
    void auditService.log({
      organizationId,
      actorUserId,
      action: 'expense.template.created',
      resource: 'expense_template',
      resourceId: row.id,
      metadata: { category: row.category, amount: row.amount.toString() },
    });

    return mapTemplate(row);
  }

  async updateTemplate(
    organizationId: string,
    actorUserId: string,
    id: string,
    input: UpdateExpenseTemplateInput,
  ): Promise<ExpenseTemplateDetail> {
    await this.getOwnedTemplate(id, organizationId);

    const data: Prisma.ExpenseTemplateUpdateInput = {};
    if (input.category !== undefined) data.category = input.category;
    if (input.amount !== undefined) data.amount = input.amount;
    if (input.dayOfMonth !== undefined) data.dayOfMonth = input.dayOfMonth;
    if (input.note !== undefined) data.note = input.note;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const row = await prisma.expenseTemplate.update({ where: { id }, data });

    appLogger.info('finance.expenseTemplate.updated', { organizationId, templateId: id });
    void auditService.log({
      organizationId,
      actorUserId,
      action: 'expense.template.updated',
      resource: 'expense_template',
      resourceId: id,
      metadata: { category: row.category, amount: row.amount.toString() },
    });

    return mapTemplate(row);
  }

  /** Soft-delete: the template stops generating; already-generated expenses are untouched. */
  async deleteTemplate(
    organizationId: string,
    actorUserId: string,
    id: string,
  ): Promise<{ id: string }> {
    const template = await this.getOwnedTemplate(id, organizationId);
    if (template.deletedAt) return { id };

    await prisma.expenseTemplate.update({ where: { id }, data: { deletedAt: new Date() } });

    appLogger.info('finance.expenseTemplate.deleted', { organizationId, templateId: id });
    void auditService.log({
      organizationId,
      actorUserId,
      action: 'expense.template.deleted',
      resource: 'expense_template',
      resourceId: id,
    });

    return { id };
  }

  /**
   * Materialize a month's expenses from the active templates. Idempotent: each template
   * yields at most one LIVE expense per month — re-running only adds the missing ones. The
   * pre-filter skips templates already generated; `skipDuplicates` (the partial unique index)
   * is the race backstop. `month` is "YYYY-MM"; the date is the template's dayOfMonth clamped
   * to that month.
   */
  async generateForMonth(
    organizationId: string,
    actorUserId: string,
    month: string,
  ): Promise<GenerateRecurringResult> {
    const templates = await prisma.expenseTemplate.findMany({
      where: { organizationId, isActive: true, deletedAt: null },
    });
    if (templates.length === 0) {
      return { month, created: 0, skipped: 0, total: 0 };
    }

    const existing = await prisma.expense.findMany({
      where: { organizationId, periodMonth: month, deletedAt: null, templateId: { not: null } },
      select: { templateId: true },
    });
    const alreadyDone = new Set(existing.map((row) => row.templateId));

    const year = Number(month.slice(0, 4));
    const monthNumber = Number(month.slice(5, 7)); // 1..12
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

    const data: Prisma.ExpenseCreateManyInput[] = templates
      .filter((template) => !alreadyDone.has(template.id))
      .map((template) => ({
        userId: actorUserId,
        organizationId,
        category: template.category,
        amount: template.amount,
        date: new Date(Date.UTC(year, monthNumber - 1, Math.min(template.dayOfMonth, lastDay))),
        note: template.note,
        templateId: template.id,
        periodMonth: month,
      }));

    const { count } = await prisma.expense.createMany({ data, skipDuplicates: true });

    appLogger.info('finance.expenseTemplate.generated', { organizationId, month, created: count });
    void auditService.log({
      organizationId,
      actorUserId,
      action: 'expense.recurring_generated',
      resource: 'expense',
      metadata: { month, created: String(count) },
    });

    return { month, created: count, skipped: templates.length - count, total: templates.length };
  }

  private async getOwnedTemplate(id: string, organizationId: string): Promise<ExpenseTemplate> {
    const row = await prisma.expenseTemplate.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!row) throw ExpenseError.notFound('Expense template not found.');
    return row;
  }
}

export const expenseTemplateServerService = new ExpenseTemplateServerService();
