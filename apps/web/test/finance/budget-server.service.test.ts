import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, expenseMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    budget: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  },
  expenseMock: { sumByCategoryForRange: vi.fn() },
  auditMock: { log: vi.fn() },
}));

vi.mock('@falka/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/logger', () => ({
  appLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/modules/audit/services/audit.service', () => ({ auditService: auditMock }));
vi.mock('@/modules/finance/services/expense-server.service', () => ({
  expenseServerService: expenseMock,
}));

const { BudgetServerService } = await import('@/modules/finance/services/budget-server.service');

const service = new BudgetServerService();
const ORG = 'org-1';
const USER = 'user-1';

type UpsertArg = {
  where: unknown;
  create: Record<string, unknown>;
  update: Record<string, unknown>;
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.budget.findMany.mockResolvedValue([]);
  prismaMock.budget.upsert.mockResolvedValue({});
  prismaMock.budget.deleteMany.mockResolvedValue({ count: 1 });
  expenseMock.sumByCategoryForRange.mockResolvedValue([]);
});

describe('getBudgetReport', () => {
  it('computes budget vs actual per category, over-budget first', async () => {
    prismaMock.budget.findMany.mockResolvedValue([
      { category: 'RENT', amount: 1_000_000 },
      { category: 'ADVERTISING', amount: 500_000 },
    ]);
    expenseMock.sumByCategoryForRange.mockResolvedValue([
      { category: 'RENT', amount: 800_000 },
      { category: 'ADVERTISING', amount: 600_000 },
    ]);

    const report = await service.getBudgetReport(ORG, '2026-06');

    // ADVERTISING is over (120%) → sorts before RENT (80%).
    expect(report.rows[0]).toEqual({
      category: 'ADVERTISING',
      budget: '500000.00',
      actual: '600000.00',
      remaining: '-100000.00',
      pctUsed: 120,
      over: true,
    });
    expect(report.rows[1]).toMatchObject({ category: 'RENT', pctUsed: 80, over: false });
    expect(report.totalBudget).toBe('1500000.00');
    expect(report.totalActual).toBe('1400000.00');
  });

  it('treats a budgeted category with no spend as 0% used', async () => {
    prismaMock.budget.findMany.mockResolvedValue([{ category: 'SALARY', amount: 2_000_000 }]);
    expenseMock.sumByCategoryForRange.mockResolvedValue([]);

    const report = await service.getBudgetReport(ORG, '2026-06');
    expect(report.rows[0]).toMatchObject({
      category: 'SALARY',
      actual: '0.00',
      remaining: '2000000.00',
      pctUsed: 0,
      over: false,
    });
  });

  it('returns empty + skips the actuals query when no budgets are set', async () => {
    prismaMock.budget.findMany.mockResolvedValue([]);
    const report = await service.getBudgetReport(ORG, '2026-06');
    expect(report).toEqual({
      month: '2026-06',
      rows: [],
      totalBudget: '0.00',
      totalActual: '0.00',
    });
    expect(expenseMock.sumByCategoryForRange).not.toHaveBeenCalled();
  });
});

describe('upsertBudgets', () => {
  it('upserts a positive budget and deletes (unsets) a zero one + audit-logs', async () => {
    await service.upsertBudgets(ORG, USER, {
      budgets: [
        { category: 'RENT', amount: 1_000_000 },
        { category: 'ADVERTISING', amount: 0 },
      ],
    });

    const upsertArg = prismaMock.budget.upsert.mock.calls[0]?.[0] as UpsertArg;
    expect(upsertArg.where).toEqual({
      organizationId_category: { organizationId: ORG, category: 'RENT' },
    });
    expect(upsertArg.create).toMatchObject({
      organizationId: ORG,
      userId: USER,
      category: 'RENT',
      amount: 1_000_000,
    });
    expect(upsertArg.update).toEqual({ amount: 1_000_000 });

    expect(prismaMock.budget.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, category: 'ADVERTISING' },
    });
    expect(auditMock.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'finance.budgets_updated' }),
    );
  });
});

describe('listBudgets', () => {
  it('lists the org budgets by category', async () => {
    prismaMock.budget.findMany.mockResolvedValue([{ category: 'RENT', amount: 1_000_000 }]);
    const list = await service.listBudgets(ORG);
    expect(prismaMock.budget.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { organizationId: ORG },
      orderBy: { category: 'asc' },
    });
    expect(list).toEqual([{ category: 'RENT', amount: '1000000' }]);
  });
});
