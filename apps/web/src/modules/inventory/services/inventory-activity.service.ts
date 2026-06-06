import 'server-only';

import { buildPaginatedResult, prisma, type PaginatedResult } from '@olshop/db';
import type { Prisma } from '@prisma/client';

import { appLogger } from '@/lib/logger';

import type { StockActivityItem } from '../types';
import type { StockActivityQuery } from '../validators/list-activity';

const MS_PER_DAY = 86_400_000;
/** Upper bound on rows returned for a CSV export; logged if exceeded. */
const EXPORT_CAP = 10_000;

const ACTIVITY_SELECT = {
  id: true,
  variantId: true,
  delta: true,
  balanceAfter: true,
  reason: true,
  source: true,
  referenceId: true,
  note: true,
  createdAt: true,
  variant: {
    select: {
      sku: true,
      name: true,
      productId: true,
      imageUrl: true,
      product: { select: { name: true } },
    },
  },
} satisfies Prisma.StockLedgerSelect;

type ActivityRow = Prisma.StockLedgerGetPayload<{ select: typeof ACTIVITY_SELECT }>;

function mapActivity(row: ActivityRow): StockActivityItem {
  return {
    id: row.id,
    variantId: row.variantId,
    productId: row.variant.productId,
    productName: row.variant.product.name,
    variantName: row.variant.name,
    sku: row.variant.sku,
    imageUrl: row.variant.imageUrl,
    delta: row.delta,
    balanceAfter: row.balanceAfter,
    reason: row.reason,
    source: row.source,
    referenceId: row.referenceId,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

function buildWhere(userId: string, query: StockActivityQuery): Prisma.StockLedgerWhereInput {
  const where: Prisma.StockLedgerWhereInput = { userId };

  if (query.reason) where.reason = query.reason;
  if (query.source) where.source = query.source;
  if (query.direction) where.delta = query.direction === 'in' ? { gt: 0 } : { lt: 0 };

  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: query.from } : {}),
      // `to` is an inclusive calendar day → take everything before the next day.
      ...(query.to ? { lt: new Date(query.to.getTime() + MS_PER_DAY) } : {}),
    };
  }

  if (query.search) {
    where.variant = {
      OR: [
        { sku: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
      ],
    };
  }

  return where;
}

/**
 * Read-only, filterable, paginated view over the append-only `StockLedger` — the
 * stock activity log. Tenant-scoped by `userId`; newest first.
 */
export class InventoryActivityService {
  async listStockActivity(
    userId: string,
    query: StockActivityQuery,
  ): Promise<PaginatedResult<StockActivityItem>> {
    const where = buildWhere(userId, query);

    const [rows, total] = await Promise.all([
      prisma.stockLedger.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: ACTIVITY_SELECT,
      }),
      prisma.stockLedger.count({ where }),
    ]);

    return buildPaginatedResult(rows.map(mapActivity), total, query.page, query.pageSize);
  }

  /** All matching rows (ignores paging) for a CSV export, capped at EXPORT_CAP. */
  async listForExport(userId: string, query: StockActivityQuery): Promise<StockActivityItem[]> {
    const where = buildWhere(userId, query);

    const rows = await prisma.stockLedger.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: EXPORT_CAP + 1,
      select: ACTIVITY_SELECT,
    });

    if (rows.length > EXPORT_CAP) {
      appLogger.warn('inventory.activity.export.truncated', { userId, cap: EXPORT_CAP });
      rows.length = EXPORT_CAP;
    }

    return rows.map(mapActivity);
  }
}

export const inventoryActivityService = new InventoryActivityService();
