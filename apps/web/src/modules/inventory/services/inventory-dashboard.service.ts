import 'server-only';

import { prisma } from '@olshop/db';

import type { InventoryDashboard, InventoryLowStockItem } from '../types';
import { aggregateDailyMovement } from '../utils/daily-movement';

const LOW_STOCK_LIST_SIZE = 8;
const RECENT_MOVEMENTS_SIZE = 10;
const DAILY_WINDOW_DAYS = 14;
const DAILY_MOVEMENT_CAP = 4000;

export class InventoryDashboardService {
  async getDashboard(userId: string): Promise<InventoryDashboard> {
    const variants = await prisma.productVariant.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        sku: true,
        name: true,
        cost: true,
        lowStockThreshold: true,
        alertEnabled: true,
        productId: true,
        imageUrl: true,
        product: { select: { name: true } },
        inventory: { select: { availableStock: true, reservedStock: true, damagedStock: true } },
      },
    });

    let totalAvailableUnits = 0;
    let totalReservedUnits = 0;
    let totalDamagedUnits = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let oversoldCount = 0;
    let totalValue = 0;
    const needsAttention: InventoryLowStockItem[] = [];

    for (const variant of variants) {
      const available = variant.inventory?.availableStock ?? 0;
      totalAvailableUnits += available;
      totalReservedUnits += variant.inventory?.reservedStock ?? 0;
      totalDamagedUnits += variant.inventory?.damagedStock ?? 0;
      if (variant.cost) totalValue += Number(variant.cost) * available;

      if (available < 0) oversoldCount += 1;
      else if (available === 0) outOfStockCount += 1;
      else if (variant.alertEnabled && available <= variant.lowStockThreshold) lowStockCount += 1;

      // "Needs attention" list includes low + out + oversold, most-urgent first.
      if (variant.alertEnabled && available <= variant.lowStockThreshold) {
        needsAttention.push({
          variantId: variant.id,
          productId: variant.productId,
          productName: variant.product.name,
          variantName: variant.name,
          sku: variant.sku,
          imageUrl: variant.imageUrl,
          availableStock: available,
          lowStockThreshold: variant.lowStockThreshold,
        });
      }
    }

    needsAttention.sort((a, b) => a.availableStock - b.availableStock);

    const movements = await prisma.stockLedger.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_MOVEMENTS_SIZE,
      select: {
        id: true,
        delta: true,
        reason: true,
        source: true,
        createdAt: true,
        variant: { select: { sku: true, name: true } },
      },
    });

    // Daily in/out stock flow over the recent window (UTC days), for the trend chart.
    const now = new Date();
    const windowStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (DAILY_WINDOW_DAYS - 1)),
    );
    const flowRows = await prisma.stockLedger.findMany({
      where: { userId, createdAt: { gte: windowStart } },
      orderBy: { createdAt: 'desc' },
      take: DAILY_MOVEMENT_CAP,
      select: { createdAt: true, delta: true },
    });

    return {
      summary: {
        variantCount: variants.length,
        totalAvailableUnits,
        totalReservedUnits,
        totalDamagedUnits,
        lowStockCount,
        outOfStockCount,
        oversoldCount,
        totalStockValue: Math.round(totalValue).toString(),
      },
      lowStock: needsAttention.slice(0, LOW_STOCK_LIST_SIZE),
      recentMovements: movements.map((movement) => ({
        id: movement.id,
        variantSku: movement.variant.sku,
        variantName: movement.variant.name,
        delta: movement.delta,
        reason: movement.reason,
        source: movement.source,
        createdAt: movement.createdAt.toISOString(),
      })),
      dailyMovement: aggregateDailyMovement(flowRows, windowStart, DAILY_WINDOW_DAYS),
    };
  }
}

export const inventoryDashboardService = new InventoryDashboardService();
