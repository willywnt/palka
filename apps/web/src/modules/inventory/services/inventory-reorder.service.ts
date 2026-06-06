import 'server-only';

import { prisma } from '@olshop/db';

import { appLogger } from '@/lib/logger';

import { REORDER_DEFAULTS, VELOCITY } from '../config';
import type { ReorderItem, ReorderReport, ReorderStatus } from '../types';
import {
  bucketEffectiveDays,
  classifyReorder,
  computeDaysOfCover,
  computeReorderQty,
  computeWeightedVelocity,
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
 * Derives the reorder report from the append-only `StockLedger`. Demand is summed
 * per variant across `VELOCITY.buckets` equal sub-windows (one grouped query each,
 * served by the composite ledger index), then turned into a recency-weighted
 * velocity → days of cover → a suggested reorder quantity and an urgency bucket.
 * Read-only; no writes.
 */
export class InventoryReorderService {
  async getReorderReport(userId: string, query: ReorderReportQuery): Promise<ReorderReport> {
    const { windowDays, leadTimeDays, targetCoverDays } = query;
    const now = new Date();
    const bucketMs = (windowDays * MS_PER_DAY) / VELOCITY.buckets;
    const bucketDays = windowDays / VELOCITY.buckets;

    const [variants, bucketGroups] = await Promise.all([
      prisma.productVariant.findMany({
        where: { userId, deletedAt: null },
        select: {
          id: true,
          productId: true,
          sku: true,
          name: true,
          cost: true,
          createdAt: true,
          leadTimeDays: true,
          minOrderQty: true,
          imageUrl: true,
          product: { select: { name: true } },
          inventory: { select: { availableStock: true, incomingStock: true } },
        },
        orderBy: [{ product: { name: 'asc' } }, { name: 'asc' }],
        take: REORDER_CAP + 1,
      }),
      // One grouped sum per recency bucket (index 0 = most recent).
      Promise.all(
        Array.from({ length: VELOCITY.buckets }, (_, bucket) =>
          prisma.stockLedger.groupBy({
            by: ['variantId'],
            where: {
              userId,
              reason: { in: [...SALES_LEDGER_REASONS] },
              createdAt: {
                gte: new Date(now.getTime() - (bucket + 1) * bucketMs),
                lt: new Date(now.getTime() - bucket * bucketMs),
              },
            },
            _sum: { delta: true },
          }),
        ),
      ),
    ]);

    if (variants.length > REORDER_CAP) {
      appLogger.warn('inventory.reorder.truncated', { userId, cap: REORDER_CAP });
      variants.length = REORDER_CAP;
    }

    // variantId → per-bucket raw delta sums (negative = sold).
    const deltaByVariantBucket = new Map<string, number[]>();
    bucketGroups.forEach((group, bucket) => {
      for (const row of group) {
        const arr =
          deltaByVariantBucket.get(row.variantId) ?? new Array<number>(VELOCITY.buckets).fill(0);
        arr[bucket] = row._sum.delta ?? 0;
        deltaByVariantBucket.set(row.variantId, arr);
      }
    });

    let reorderCount = 0;
    let urgentCount = 0;
    let deadStockCount = 0;
    let deadStockValueTotal = 0;

    const items: ReorderItem[] = variants.map((variant) => {
      const available = variant.inventory?.availableStock ?? 0;
      const incoming = variant.inventory?.incomingStock ?? 0;

      // A variant's own lead time overrides the request-level default.
      const effectiveLeadTime = variant.leadTimeDays ?? leadTimeDays;
      const minOrderQty = variant.minOrderQty ?? undefined;

      const ageDays = (now.getTime() - variant.createdAt.getTime()) / MS_PER_DAY;
      const bucketDeltas =
        deltaByVariantBucket.get(variant.id) ?? new Array<number>(VELOCITY.buckets).fill(0);
      const bucketUnits = bucketDeltas.map(netUnitsSold);
      const effDaysPerBucket = Array.from({ length: VELOCITY.buckets }, (_, b) =>
        bucketEffectiveDays(ageDays, b * bucketDays, (b + 1) * bucketDays),
      );

      const unitsSold = netUnitsSold(bucketDeltas.reduce((sum, delta) => sum + delta, 0));
      const dailyVelocity = computeWeightedVelocity(bucketUnits, effDaysPerBucket, VELOCITY.decay);
      const daysOfCover = computeDaysOfCover(available, dailyVelocity);
      const suggestedReorderQty = computeReorderQty({
        available,
        incoming,
        dailyVelocity,
        leadTimeDays: effectiveLeadTime,
        targetCoverDays,
        minOrderQty,
      });
      const status = classifyReorder({
        available,
        dailyVelocity,
        daysOfCover,
        leadTimeDays: effectiveLeadTime,
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
        imageUrl: variant.imageUrl,
        availableStock: available,
        incomingStock: incoming,
        unitsSold,
        dailyVelocity,
        daysOfCover,
        leadTimeDays: effectiveLeadTime,
        minOrderQty: minOrderQty ?? null,
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
