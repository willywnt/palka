import 'server-only';

import { prisma } from '@olshop/db';

import type {
  ChannelPerformanceReport,
  InventoryValuationReport,
  ProfitBySku,
  ProfitChannel,
  ProfitReport,
} from '../types';
import type { ProfitReportQuery } from '../validators/profit-report';
import {
  aggregateChannelPerformance,
  type TransactionsByChannel,
} from '../utils/channel-performance-aggregate';
import {
  aggregateInventoryValuation,
  type ValuationVariant,
} from '../utils/inventory-valuation-aggregate';
import { aggregateProfit, aggregateProfitBySku, type SoldLine } from '../utils/profit-aggregate';

const DEFAULT_RANGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

/**
 * Read-only profit/margin reporting over realized sales. Revenue is recognized
 * for POS sales that are COMPLETED and for marketplace orders that have shipped
 * (SHIPPED/COMPLETED); COGS comes from each line's snapshotted unitCost. A
 * processed return (RECEIVED) on a still-shipped/completed order nets its lines
 * back out — recognized when the goods return (`processedAt`), as negative-qty
 * lines — so a returned order no longer overstates profit. Never writes — it
 * only reads SaleItem/OrderItem/Return history.
 */
export class ReportingServerService {
  private async loadSoldLines(
    userId: string,
    query: ProfitReportQuery,
  ): Promise<{ lines: SoldLine[]; from: Date; to: Date }> {
    const to = endOfDay(query.to ?? new Date());
    const from = startOfDay(query.from ?? new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS));

    const [saleItems, orderItems, returns] = await Promise.all([
      prisma.saleItem.findMany({
        where: { sale: { userId, status: 'COMPLETED', createdAt: { gte: from, lte: to } } },
        select: {
          quantity: true,
          unitPrice: true,
          unitCost: true,
          sku: true,
          name: true,
          productVariantId: true,
          sale: { select: { createdAt: true } },
        },
      }),
      prisma.orderItem.findMany({
        where: {
          productVariantId: { not: null },
          order: {
            userId,
            status: { in: ['SHIPPED', 'COMPLETED'] },
            placedAt: { gte: from, lte: to },
          },
        },
        select: {
          quantity: true,
          unitPrice: true,
          unitCost: true,
          externalSku: true,
          externalName: true,
          productVariantId: true,
          productVariant: { select: { sku: true, name: true } },
          order: { select: { placedAt: true, provider: true } },
        },
      }),
      // Processed returns whose order still counts as revenue above. A post-ship
      // cancellation (order status CANCELLED) is already excluded from revenue, so
      // netting it here would double-subtract — gate on SHIPPED/COMPLETED. Recognized
      // by processedAt (when the goods actually came back).
      prisma.return.findMany({
        where: {
          userId,
          status: 'RECEIVED',
          processedAt: { gte: from, lte: to },
          order: { status: { in: ['SHIPPED', 'COMPLETED'] } },
        },
        select: {
          processedAt: true,
          items: { select: { orderItemId: true, productVariantId: true, quantity: true } },
          order: {
            select: {
              provider: true,
              items: {
                select: {
                  id: true,
                  unitPrice: true,
                  unitCost: true,
                  externalSku: true,
                  externalName: true,
                  productVariant: { select: { sku: true, name: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    const lines: SoldLine[] = [
      ...saleItems.map((item) => ({
        date: item.sale.createdAt,
        channel: 'POS' as ProfitChannel,
        variantId: item.productVariantId,
        sku: item.sku,
        name: item.name,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        unitCost: item.unitCost == null ? null : Number(item.unitCost),
      })),
      ...orderItems.map((item) => ({
        date: item.order.placedAt,
        channel: item.order.provider as ProfitChannel,
        variantId: item.productVariantId,
        sku: item.productVariant?.sku ?? item.externalSku ?? '—',
        name: item.productVariant?.name ?? item.externalName,
        quantity: item.quantity,
        unitPrice: item.unitPrice == null ? 0 : Number(item.unitPrice),
        unitCost: item.unitCost == null ? null : Number(item.unitCost),
      })),
    ];

    // Net each processed return back out, valued at the original order line's
    // snapshotted price/cost, as a negative-qty line (reverses both revenue + COGS).
    for (const ret of returns) {
      if (!ret.processedAt) continue;
      const orderItemsById = new Map(ret.order.items.map((item) => [item.id, item]));
      for (const item of ret.items) {
        if (!item.productVariantId) continue;
        const orderItem = orderItemsById.get(item.orderItemId);
        if (!orderItem) continue;
        lines.push({
          date: ret.processedAt,
          channel: ret.order.provider as ProfitChannel,
          variantId: item.productVariantId,
          sku: orderItem.productVariant?.sku ?? orderItem.externalSku ?? '—',
          name: orderItem.productVariant?.name ?? orderItem.externalName,
          quantity: -item.quantity,
          unitPrice: orderItem.unitPrice == null ? 0 : Number(orderItem.unitPrice),
          unitCost: orderItem.unitCost == null ? null : Number(orderItem.unitCost),
        });
      }
    }

    return { lines, from, to };
  }

  async getProfitReport(userId: string, query: ProfitReportQuery): Promise<ProfitReport> {
    const { lines, from, to } = await this.loadSoldLines(userId, query);
    return aggregateProfit(lines, { from, to, groupBy: query.groupBy });
  }

  /** Full per-SKU profit rows for the CSV export (no top/bottom slicing). */
  async getProfitSkuRows(userId: string, query: ProfitReportQuery): Promise<ProfitBySku[]> {
    const { lines } = await this.loadSoldLines(userId, query);
    return aggregateProfitBySku(lines);
  }

  /**
   * Count realized transactions per channel over the SAME range + recognition as
   * the sold lines: one per COMPLETED POS sale, one per SHIPPED/COMPLETED order
   * (grouped by provider). Drives average-order-value (a SoldLine is per-item).
   */
  private async loadTransactionCounts(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<TransactionsByChannel> {
    const [posCount, ordersByProvider] = await Promise.all([
      prisma.sale.count({
        where: { userId, status: 'COMPLETED', createdAt: { gte: from, lte: to } },
      }),
      prisma.order.groupBy({
        by: ['provider'],
        where: {
          userId,
          status: { in: ['SHIPPED', 'COMPLETED'] },
          placedAt: { gte: from, lte: to },
        },
        _count: { _all: true },
      }),
    ]);

    const transactions: TransactionsByChannel = {};
    if (posCount > 0) transactions.POS = posCount;
    for (const row of ordersByProvider) {
      transactions[row.provider as ProfitChannel] = row._count._all;
    }
    return transactions;
  }

  /**
   * Per-channel performance: the profit metrics per channel plus revenue share,
   * transactions + average order value, refunds/return rate, and a channel ×
   * period revenue trend. Same realized-sales basis as the profit report.
   */
  async getChannelPerformance(
    userId: string,
    query: ProfitReportQuery,
  ): Promise<ChannelPerformanceReport> {
    const { lines, from, to } = await this.loadSoldLines(userId, query);
    const transactions = await this.loadTransactionCounts(userId, from, to);
    return aggregateChannelPerformance(lines, transactions, { from, to, groupBy: query.groupBy });
  }

  /**
   * Current inventory valuation: every live variant's on-hand stock valued at its
   * moving-average cost (same formula as the dashboard's totalStockValue), rolled
   * up per product. A snapshot — no date range.
   */
  async getInventoryValuation(userId: string): Promise<InventoryValuationReport> {
    const variants = await prisma.productVariant.findMany({
      where: { userId, deletedAt: null },
      select: {
        productId: true,
        cost: true,
        product: { select: { name: true, category: true } },
        inventory: { select: { availableStock: true } },
      },
    });

    const lines: ValuationVariant[] = variants.map((variant) => ({
      productId: variant.productId,
      productName: variant.product.name,
      category: variant.product.category,
      available: variant.inventory?.availableStock ?? 0,
      cost: variant.cost == null ? null : Number(variant.cost),
    }));

    return aggregateInventoryValuation(lines);
  }
}

export const reportingServerService = new ReportingServerService();
