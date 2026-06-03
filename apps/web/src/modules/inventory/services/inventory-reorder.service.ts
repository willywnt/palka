import 'server-only';

import { prisma } from '@olshop/db';

import { appLogger } from '@/lib/logger';

import { REORDER_DEFAULTS } from '../config';
import type { ReorderItem, ReorderReport, ReorderStatus } from '../types';
import {
  classifyReorder,
  computeDaysOfCover,
  computeReorderQty,
  computeVelocity,
  effectiveWindowDays,
  netUnitsSold,
  SALES_LEDGER_REASONS,
} from '../utils/reorder-math';
import type { ReorderReportQuery } from '../validators/reorder-report';

const MS_PER_DAY = 86_400_000;
/** Upper bound on variants scanned for the report; logged if exceeded. */
const REORDER_CAP = 1000;

/** Most-urgent buckets first, for the report's default ordering. */
const STATUS_RANK: Record<ReorderStatus, number> = {
  URGENT: 0,
  SOON: 1,
  DEAD: 2,
  OK: 3,
  NO_DATA: 4,
};

/**
 * Derives the reorder report from the append-only `StockLedger`: a single grouped
 * query sums windowed demand per variant, which becomes velocity → days of cover
 * → a suggested reorder quantity and an urgency bucket. Read-only; no writes.
 */
export class InventoryReorderService {
  async getReorderReport(userId: string, query: ReorderReportQuery): Promise<ReorderReport> {
    const { windowDays, leadTimeDays, targetCoverDays } = query;
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowDays * MS_PER_DAY);

    const [variants, salesByVariant] = await Promise.all([
      prisma.productVariant.findMany({
        where: { userId, deletedAt: null },
        select: {
          id: true,
          productId: true,
          sku: true,
          name: true,
          cost: true,
          createdAt: true,
          product: { select: { name: true } },
          inventory: { select: { availableStock: true, incomingStock: true } },
        },
        orderBy: [{ product: { name: 'asc' } }, { name: 'asc' }],
        take: REORDER_CAP + 1,
      }),
      prisma.stockLedger.groupBy({
        by: ['variantId'],
        where: {
          userId,
          reason: { in: [...SALES_LEDGER_REASONS] },
          createdAt: { gte: windowStart },
        },
        _sum: { delta: true },
      }),
    ]);

    if (variants.length > REORDER_CAP) {
      appLogger.warn('inventory.reorder.truncated', { userId, cap: REORDER_CAP });
      variants.length = REORDER_CAP;
    }

    const soldByVariant = new Map<string, number>();
    for (const row of salesByVariant) {
      soldByVariant.set(row.variantId, netUnitsSold(row._sum.delta ?? 0));
    }

    let reorderCount = 0;
    let urgentCount = 0;
    let deadStockCount = 0;
    let deadStockValueTotal = 0;

    const items: ReorderItem[] = variants.map((variant) => {
      const available = variant.inventory?.availableStock ?? 0;
      const incoming = variant.inventory?.incomingStock ?? 0;
      const unitsSold = soldByVariant.get(variant.id) ?? 0;

      const ageDays = (now.getTime() - variant.createdAt.getTime()) / MS_PER_DAY;
      const effectiveDays = effectiveWindowDays(windowDays, ageDays);
      const dailyVelocity = computeVelocity(unitsSold, effectiveDays);
      const daysOfCover = computeDaysOfCover(available, dailyVelocity);
      const suggestedReorderQty = computeReorderQty({
        available,
        incoming,
        dailyVelocity,
        leadTimeDays,
        targetCoverDays,
      });
      const status = classifyReorder({
        available,
        dailyVelocity,
        daysOfCover,
        leadTimeDays,
        targetCoverDays,
        variantAgeDays: ageDays,
        deadStockDays: REORDER_DEFAULTS.deadStockDays,
      });

      const stockValueNum = variant.cost ? Math.round(Number(variant.cost) * available) : 0;

      if (status === 'URGENT') {
        reorderCount += 1;
        urgentCount += 1;
      } else if (status === 'SOON') {
        reorderCount += 1;
      } else if (status === 'DEAD') {
        deadStockCount += 1;
        deadStockValueTotal += stockValueNum;
      }

      return {
        variantId: variant.id,
        productId: variant.productId,
        productName: variant.product.name,
        variantName: variant.name,
        sku: variant.sku,
        availableStock: available,
        incomingStock: incoming,
        unitsSold,
        dailyVelocity,
        daysOfCover,
        suggestedReorderQty,
        status,
        stockValue: stockValueNum.toString(),
      };
    });

    items.sort((a, b) => {
      const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (rankDiff !== 0) return rankDiff;
      const aCover = a.daysOfCover ?? Number.POSITIVE_INFINITY;
      const bCover = b.daysOfCover ?? Number.POSITIVE_INFINITY;
      return aCover - bCover;
    });

    return {
      summary: {
        windowDays,
        leadTimeDays,
        targetCoverDays,
        reorderCount,
        urgentCount,
        deadStockCount,
        deadStockValue: deadStockValueTotal.toString(),
      },
      items,
    };
  }
}

export const inventoryReorderService = new InventoryReorderService();
