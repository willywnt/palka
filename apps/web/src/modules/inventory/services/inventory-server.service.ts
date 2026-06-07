import 'server-only';

import { prisma, type TransactionClient } from '@olshop/db';
import { enqueuePropagateInventoryStock } from '@olshop/queue';
import type { Inventory, StockLedger } from '@prisma/client';

import { appLogger } from '@/lib/logger';

import { InventoryError } from '../errors/inventory-errors';
import type {
  AdjustStockResult,
  InventorySnapshot,
  InventoryView,
  StockLedgerEntryItem,
  StockOverviewItem,
} from '../types';
import type { AdjustStockInput } from '../validators/adjust-stock';
import type { ListStockOverviewQuery } from '../validators/list-stock-overview';
import { computeMovingAverageCost } from '../utils/cost-math';
import {
  clampWriteOffQuantity,
  computeBalanceAfter,
  damagedBucketDelta,
} from '../utils/stock-math';

const LEDGER_PAGE_SIZE = 50;
/** Upper bound on variants scanned for the stock overview; logged if exceeded. */
const OVERVIEW_CAP = 500;

function emptySnapshot(variantId: string): InventorySnapshot {
  return {
    variantId,
    availableStock: 0,
    reservedStock: 0,
    damagedStock: 0,
    incomingStock: 0,
    lastAdjustedAt: null,
  };
}

function mapInventory(inventory: Inventory): InventorySnapshot {
  return {
    variantId: inventory.variantId,
    availableStock: inventory.availableStock,
    reservedStock: inventory.reservedStock,
    damagedStock: inventory.damagedStock,
    incomingStock: inventory.incomingStock,
    lastAdjustedAt: inventory.lastAdjustedAt?.toISOString() ?? null,
  };
}

function mapLedgerEntry(entry: StockLedger): StockLedgerEntryItem {
  return {
    id: entry.id,
    variantId: entry.variantId,
    delta: entry.delta,
    balanceAfter: entry.balanceAfter,
    reason: entry.reason,
    source: entry.source,
    referenceId: entry.referenceId,
    note: entry.note,
    createdAt: entry.createdAt.toISOString(),
  };
}

/**
 * Owns the `Inventory` (fast-read cache) and append-only `StockLedger` (source of
 * truth) tables. Every stock mutation writes a ledger row and updates the cached
 * snapshot inside a single transaction. Other modules touch stock ONLY through
 * this service.
 */
export class InventoryServerService {
  /** Idempotently create the 1:1 inventory row for a newly created variant. */
  async ensureInventory(variantId: string): Promise<InventorySnapshot> {
    const inventory = await prisma.inventory.upsert({
      where: { variantId },
      create: { variantId },
      update: {},
    });

    return mapInventory(inventory);
  }

  async getSnapshot(userId: string, variantId: string): Promise<InventorySnapshot> {
    await this.assertVariantOwned(userId, variantId);

    const inventory = await prisma.inventory.findUnique({ where: { variantId } });
    return inventory ? mapInventory(inventory) : emptySnapshot(variantId);
  }

  async getView(userId: string, variantId: string): Promise<InventoryView> {
    await this.assertVariantOwned(userId, variantId);

    const [inventory, entries] = await Promise.all([
      prisma.inventory.findUnique({ where: { variantId } }),
      prisma.stockLedger.findMany({
        where: { variantId, userId },
        orderBy: { createdAt: 'desc' },
        take: LEDGER_PAGE_SIZE,
      }),
    ]);

    return {
      snapshot: inventory ? mapInventory(inventory) : emptySnapshot(variantId),
      ledger: entries.map(mapLedgerEntry),
    };
  }

  /**
   * Flat stock view across all of a user's variants (low-stock first). Bounded
   * by OVERVIEW_CAP; truncation is logged rather than silently dropping rows.
   */
  async listStockOverview(
    userId: string,
    query: ListStockOverviewQuery,
  ): Promise<StockOverviewItem[]> {
    const variants = await prisma.productVariant.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(query.search
          ? {
              OR: [
                { sku: { contains: query.search, mode: 'insensitive' } },
                { name: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        inventory: {
          select: {
            availableStock: true,
            reservedStock: true,
            damagedStock: true,
            incomingStock: true,
            lastAdjustedAt: true,
          },
        },
        product: { select: { name: true } },
      },
      orderBy: [{ product: { name: 'asc' } }, { name: 'asc' }],
      take: OVERVIEW_CAP + 1,
    });

    if (variants.length > OVERVIEW_CAP) {
      appLogger.warn('inventory.overview.truncated', { userId, cap: OVERVIEW_CAP });
      variants.length = OVERVIEW_CAP;
    }

    const items = variants.map((variant): StockOverviewItem => {
      const availableStock = variant.inventory?.availableStock ?? 0;
      return {
        variantId: variant.id,
        productId: variant.productId,
        productName: variant.product.name,
        sku: variant.sku,
        barcode: variant.barcode,
        variantName: variant.name,
        availableStock,
        reservedStock: variant.inventory?.reservedStock ?? 0,
        damagedStock: variant.inventory?.damagedStock ?? 0,
        incomingStock: variant.inventory?.incomingStock ?? 0,
        lowStockThreshold: variant.lowStockThreshold,
        isLowStock: variant.alertEnabled && availableStock <= variant.lowStockThreshold,
        imageUrl: variant.imageUrl,
        labelPrintedAt: variant.labelPrintedAt?.toISOString() ?? null,
        lastUpdatedAt: variant.inventory?.lastAdjustedAt?.toISOString() ?? null,
      };
    });

    const filtered = query.lowStockOnly ? items.filter((item) => item.isLowStock) : items;

    // Surface low-stock rows first; keep the DB name ordering as the tiebreaker.
    return filtered.sort((a, b) => Number(b.isLowStock) - Number(a.isLowStock));
  }

  async adjustStock(
    userId: string,
    variantId: string,
    input: AdjustStockInput,
  ): Promise<AdjustStockResult> {
    const outcome = await prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findFirst({
        where: { id: variantId, userId, deletedAt: null },
        select: { id: true },
      });
      if (!variant) throw InventoryError.variantNotFound();

      const existing = await tx.inventory.findUnique({ where: { variantId } });
      const currentAvailable = existing?.availableStock ?? 0;

      const balance = computeBalanceAfter(currentAvailable, input.delta);
      if (!balance.ok) {
        if (balance.reason === 'insufficient_stock') {
          throw InventoryError.insufficientStock(currentAvailable, input.delta);
        }
        throw InventoryError.validation('Delta must not be zero.');
      }

      const now = new Date();
      // Removing stock as DAMAGE turns a good unit into a damaged one: available
      // drops (above) AND the damaged bucket rises by the same amount.
      const damagedDelta = damagedBucketDelta(input.reason, input.delta);
      const inventory = await tx.inventory.upsert({
        where: { variantId },
        create: {
          variantId,
          availableStock: balance.balanceAfter,
          damagedStock: damagedDelta,
          lastAdjustedAt: now,
        },
        update: {
          availableStock: balance.balanceAfter,
          ...(damagedDelta > 0 ? { damagedStock: { increment: damagedDelta } } : {}),
          lastAdjustedAt: now,
        },
      });

      const entry = await tx.stockLedger.create({
        data: {
          userId,
          variantId,
          delta: input.delta,
          balanceAfter: balance.balanceAfter,
          reason: input.reason,
          source: 'MANUAL',
          note: input.note ?? null,
        },
      });

      return { inventory: mapInventory(inventory), entry: mapLedgerEntry(entry) };
    });

    appLogger.info('inventory.adjusted', {
      userId,
      variantId,
      delta: input.delta,
      reason: input.reason,
      balanceAfter: outcome.entry.balanceAfter,
    });

    await this.propagateToMarketplaces(
      userId,
      variantId,
      outcome.inventory.availableStock,
      outcome.entry.id,
    );

    return outcome;
  }

  /**
   * Write off / dispose damaged units — removes them from the damaged bucket
   * (clamped to what is held). Available is UNCHANGED (the units already left
   * available when they were damaged), so this never propagates. Records a
   * DAMAGE_WRITE_OFF ledger row with delta 0 (the ledger is available-centric)
   * and the disposed count in the note for the audit trail.
   */
  async disposeDamaged(
    userId: string,
    variantId: string,
    quantity: number,
    note?: string,
  ): Promise<AdjustStockResult> {
    const outcome = await prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findFirst({
        where: { id: variantId, userId, deletedAt: null },
        select: { id: true },
      });
      if (!variant) throw InventoryError.variantNotFound();

      const existing = await tx.inventory.findUnique({ where: { variantId } });
      const disposed = clampWriteOffQuantity(existing?.damagedStock ?? 0, quantity);
      if (disposed <= 0) {
        throw InventoryError.validation('No damaged stock to write off.');
      }

      const available = existing?.availableStock ?? 0;
      const now = new Date();
      const inventory = await tx.inventory.update({
        where: { variantId },
        data: { damagedStock: { decrement: disposed }, lastAdjustedAt: now },
      });

      const entry = await tx.stockLedger.create({
        data: {
          userId,
          variantId,
          delta: 0,
          balanceAfter: available,
          reason: 'DAMAGE_WRITE_OFF',
          source: 'MANUAL',
          note: `Wrote off ${disposed} damaged unit(s)${note ? ` — ${note}` : ''}`,
        },
      });

      return { inventory: mapInventory(inventory), entry: mapLedgerEntry(entry) };
    });

    appLogger.info('inventory.damage_written_off', { userId, variantId });
    return outcome;
  }

  /**
   * Best-effort fan-out of a stock change to sync-enabled marketplace listings.
   * Enqueues a propagate job; never blocks or fails the adjustment if the queue
   * (Redis) is unavailable or there is nothing to sync.
   */
  private async propagateToMarketplaces(
    userId: string,
    variantId: string,
    availableStock: number,
    eventId: string,
  ): Promise<void> {
    try {
      const syncEnabledCount = await prisma.marketplaceProductMapping.count({
        where: { productVariantId: variantId, userId, syncEnabled: true },
      });
      if (syncEnabledCount === 0) return;

      await enqueuePropagateInventoryStock({ userId, variantId, availableStock, eventId });
    } catch (error) {
      appLogger.warn('inventory.propagate.enqueue_failed', {
        userId,
        variantId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Reserves stock for a paid marketplace order WITHIN the caller's transaction:
   * the units are committed, so available drops (no longer sellable) and reserved
   * rises (held until shipped) — on-hand (available + reserved) is unchanged.
   * Available MAY go negative (an oversell that already happened on the channel) so
   * the ledger stays honest. Records an `ORDER_RESERVE` row (negative available
   * delta). Returns the new available balance. Does NOT enqueue propagation; the
   * caller does that after commit.
   */
  async applyOrderReserveTx(
    tx: TransactionClient,
    params: { userId: string; variantId: string; quantity: number; orderId: string },
  ): Promise<number> {
    const existing = await tx.inventory.findUnique({ where: { variantId: params.variantId } });
    const balanceAfter = (existing?.availableStock ?? 0) - params.quantity;
    const now = new Date();

    await tx.inventory.upsert({
      where: { variantId: params.variantId },
      create: {
        variantId: params.variantId,
        availableStock: balanceAfter,
        reservedStock: params.quantity,
        lastAdjustedAt: now,
      },
      update: {
        availableStock: balanceAfter,
        reservedStock: { increment: params.quantity },
        lastAdjustedAt: now,
      },
    });

    await tx.stockLedger.create({
      data: {
        userId: params.userId,
        variantId: params.variantId,
        delta: -params.quantity,
        balanceAfter,
        reason: 'ORDER_RESERVE',
        source: 'MARKETPLACE',
        referenceId: params.orderId,
        note: 'Marketplace order',
      },
    });

    return balanceAfter;
  }

  /**
   * Consumes a reservation WITHIN the caller's transaction — the order shipped, so
   * the reserved units physically leave: reserved drops (clamped at 0 for orders
   * reserved before this lifecycle existed), available is unchanged. Records an
   * `ORDER_SHIP` row with delta 0 (the ledger tracks available; shipping only moves
   * on-hand) for a complete order audit trail. Returns the unchanged available
   * balance.
   */
  async applyOrderShipTx(
    tx: TransactionClient,
    params: { userId: string; variantId: string; quantity: number; orderId: string },
  ): Promise<number> {
    const existing = await tx.inventory.findUnique({ where: { variantId: params.variantId } });
    const available = existing?.availableStock ?? 0;
    const reservedStock = this.decrementReserved(existing?.reservedStock ?? 0, params);
    const now = new Date();

    await tx.inventory.upsert({
      where: { variantId: params.variantId },
      create: { variantId: params.variantId, availableStock: available, lastAdjustedAt: now },
      update: { reservedStock, lastAdjustedAt: now },
    });

    await tx.stockLedger.create({
      data: {
        userId: params.userId,
        variantId: params.variantId,
        delta: 0,
        balanceAfter: available,
        reason: 'ORDER_SHIP',
        source: 'MARKETPLACE',
        referenceId: params.orderId,
        note: 'Marketplace order shipped',
      },
    });

    return available;
  }

  /**
   * Releases a reservation WITHIN the caller's transaction — used when a reserved
   * (not-yet-shipped) order is cancelled. Available rises back and reserved drops
   * (clamped at 0), reversing applyOrderReserveTx. Records an `ORDER_RELEASE` row
   * (positive available delta) so the reorder velocity nets it out against the
   * original `ORDER_RESERVE`. Returns the new available balance. Does NOT enqueue
   * propagation; the caller does that after commit.
   */
  async applyOrderReleaseTx(
    tx: TransactionClient,
    params: { userId: string; variantId: string; quantity: number; orderId: string },
  ): Promise<number> {
    const existing = await tx.inventory.findUnique({ where: { variantId: params.variantId } });
    const balanceAfter = (existing?.availableStock ?? 0) + params.quantity;
    const reservedStock = this.decrementReserved(existing?.reservedStock ?? 0, params);
    const now = new Date();

    await tx.inventory.upsert({
      where: { variantId: params.variantId },
      create: { variantId: params.variantId, availableStock: balanceAfter, lastAdjustedAt: now },
      update: { availableStock: balanceAfter, reservedStock, lastAdjustedAt: now },
    });

    await tx.stockLedger.create({
      data: {
        userId: params.userId,
        variantId: params.variantId,
        delta: params.quantity,
        balanceAfter,
        reason: 'ORDER_RELEASE',
        source: 'MARKETPLACE',
        referenceId: params.orderId,
        note: 'Marketplace order cancelled',
      },
    });

    return balanceAfter;
  }

  /**
   * Returns a resellable unit to available WITHIN the caller's transaction — used
   * when a received return is dispositioned RESTOCK. Records a `RETURN` row
   * (positive available delta) so the reorder velocity nets it out against the
   * original sale. Returns the new available balance. Does NOT enqueue propagation;
   * the caller does that after commit.
   */
  async applyReturnRestockTx(
    tx: TransactionClient,
    params: { userId: string; variantId: string; quantity: number; returnId: string },
  ): Promise<number> {
    const existing = await tx.inventory.findUnique({ where: { variantId: params.variantId } });
    const balanceAfter = (existing?.availableStock ?? 0) + params.quantity;
    const now = new Date();

    await tx.inventory.upsert({
      where: { variantId: params.variantId },
      create: { variantId: params.variantId, availableStock: balanceAfter, lastAdjustedAt: now },
      update: { availableStock: balanceAfter, lastAdjustedAt: now },
    });

    await tx.stockLedger.create({
      data: {
        userId: params.userId,
        variantId: params.variantId,
        delta: params.quantity,
        balanceAfter,
        reason: 'RETURN',
        source: 'MARKETPLACE',
        referenceId: params.returnId,
        note: 'Return — restocked',
      },
    });

    return balanceAfter;
  }

  /**
   * Routes a received return into damaged stock WITHIN the caller's transaction —
   * used when a received return is dispositioned DAMAGED. Available is unchanged
   * (the unit is not resellable), so the `RETURN` row carries a delta of 0 (the
   * ledger tracks available; damaged is a separate bucket) for the audit trail.
   * Returns the unchanged available balance.
   */
  async applyReturnDamagedTx(
    tx: TransactionClient,
    params: { userId: string; variantId: string; quantity: number; returnId: string },
  ): Promise<number> {
    const existing = await tx.inventory.findUnique({ where: { variantId: params.variantId } });
    const available = existing?.availableStock ?? 0;
    const now = new Date();

    await tx.inventory.upsert({
      where: { variantId: params.variantId },
      create: {
        variantId: params.variantId,
        availableStock: available,
        damagedStock: params.quantity,
        lastAdjustedAt: now,
      },
      update: { damagedStock: { increment: params.quantity }, lastAdjustedAt: now },
    });

    await tx.stockLedger.create({
      data: {
        userId: params.userId,
        variantId: params.variantId,
        delta: 0,
        balanceAfter: available,
        reason: 'RETURN',
        source: 'MARKETPLACE',
        referenceId: params.returnId,
        note: 'Return — damaged',
      },
    });

    return available;
  }

  /**
   * Decrements available stock for an offline (POS) sale WITHIN the caller's
   * transaction — the unit leaves the counter immediately, so there is no reserve
   * step. Available MAY go negative (the SoT can lag an online edit while the goods
   * are physically in hand). Records a `SALE` row (source `POS`). Returns the new
   * balance; the caller propagates after commit.
   */
  async applyOfflineSaleTx(
    tx: TransactionClient,
    params: { userId: string; variantId: string; quantity: number; saleId: string },
  ): Promise<number> {
    const existing = await tx.inventory.findUnique({ where: { variantId: params.variantId } });
    const balanceAfter = (existing?.availableStock ?? 0) - params.quantity;
    const now = new Date();

    await tx.inventory.upsert({
      where: { variantId: params.variantId },
      create: { variantId: params.variantId, availableStock: balanceAfter, lastAdjustedAt: now },
      update: { availableStock: balanceAfter, lastAdjustedAt: now },
    });

    await tx.stockLedger.create({
      data: {
        userId: params.userId,
        variantId: params.variantId,
        delta: -params.quantity,
        balanceAfter,
        reason: 'SALE',
        source: 'POS',
        referenceId: params.saleId,
        note: 'Offline sale',
      },
    });

    return balanceAfter;
  }

  /**
   * Reverses an offline sale WITHIN the caller's transaction — used when a counter
   * sale is voided: the goods come back, so available rises again. Records a
   * positive `SALE` row (source `POS`) that nets the original sale out of demand
   * velocity. Returns the new balance; the caller propagates after commit.
   */
  async applyOfflineSaleReversalTx(
    tx: TransactionClient,
    params: { userId: string; variantId: string; quantity: number; saleId: string },
  ): Promise<number> {
    const existing = await tx.inventory.findUnique({ where: { variantId: params.variantId } });
    const balanceAfter = (existing?.availableStock ?? 0) + params.quantity;
    const now = new Date();

    await tx.inventory.upsert({
      where: { variantId: params.variantId },
      create: { variantId: params.variantId, availableStock: balanceAfter, lastAdjustedAt: now },
      update: { availableStock: balanceAfter, lastAdjustedAt: now },
    });

    await tx.stockLedger.create({
      data: {
        userId: params.userId,
        variantId: params.variantId,
        delta: params.quantity,
        balanceAfter,
        reason: 'SALE',
        source: 'POS',
        referenceId: params.saleId,
        note: 'Sale voided',
      },
    });

    return balanceAfter;
  }

  /**
   * Adjusts the incoming (on-order) bucket WITHIN the caller's transaction — used
   * when a purchase order is placed (positive delta) or cancelled (negative). No
   * ledger row: incoming is a forecast bucket and available is unchanged. Clamped at 0.
   */
  async adjustIncomingTx(
    tx: TransactionClient,
    params: { variantId: string; delta: number },
  ): Promise<void> {
    const existing = await tx.inventory.findUnique({ where: { variantId: params.variantId } });
    const current = existing?.incomingStock ?? 0;
    if (current + params.delta < 0) {
      appLogger.warn('inventory.incoming.underflow_clamped', {
        variantId: params.variantId,
        current,
        delta: params.delta,
      });
    }
    const next = Math.max(0, current + params.delta);
    const now = new Date();

    await tx.inventory.upsert({
      where: { variantId: params.variantId },
      create: {
        variantId: params.variantId,
        incomingStock: Math.max(0, params.delta),
        lastAdjustedAt: now,
      },
      update: { incomingStock: next, lastAdjustedAt: now },
    });
  }

  /**
   * Receives purchased units WITHIN the caller's transaction: incoming drops
   * (clamped at 0) and available rises. Records a `RESTOCK` row (source `PURCHASE`).
   * Returns the new available balance; the caller propagates after commit.
   */
  async applyPurchaseReceiveTx(
    tx: TransactionClient,
    params: {
      userId: string;
      variantId: string;
      quantity: number;
      purchaseOrderId: string;
      unitCost?: number;
    },
  ): Promise<number> {
    const existing = await tx.inventory.findUnique({ where: { variantId: params.variantId } });
    const onHandQty = existing?.availableStock ?? 0;
    const balanceAfter = onHandQty + params.quantity;
    const incomingStock = Math.max(0, (existing?.incomingStock ?? 0) - params.quantity);
    const now = new Date();

    await tx.inventory.upsert({
      where: { variantId: params.variantId },
      create: { variantId: params.variantId, availableStock: balanceAfter, lastAdjustedAt: now },
      update: { availableStock: balanceAfter, incomingStock, lastAdjustedAt: now },
    });

    // Fold the received units' cost into the variant's moving-average cost (HPP),
    // using on-hand BEFORE this receive. Skipped when the PO line carries no usable cost.
    if (params.unitCost !== undefined) {
      const variant = await tx.productVariant.findUnique({
        where: { id: params.variantId },
        select: { cost: true },
      });
      const newCost = computeMovingAverageCost({
        onHandQty,
        currentCost: variant?.cost != null ? Number(variant.cost) : null,
        receivedQty: params.quantity,
        receivedCost: params.unitCost,
      });
      if (newCost !== null) {
        await tx.productVariant.update({
          where: { id: params.variantId },
          data: { cost: newCost },
        });
      }
    }

    await tx.stockLedger.create({
      data: {
        userId: params.userId,
        variantId: params.variantId,
        delta: params.quantity,
        balanceAfter,
        reason: 'RESTOCK',
        source: 'PURCHASE',
        referenceId: params.purchaseOrderId,
        note: 'Purchase received',
      },
    });

    return balanceAfter;
  }

  /**
   * Reserved units never go below zero. Orders reserved before this lifecycle
   * existed carry no reservation, so shipping/cancelling them would underflow — we
   * clamp at 0 and log instead.
   */
  private decrementReserved(
    current: number,
    params: { variantId: string; quantity: number; orderId: string },
  ): number {
    if (current < params.quantity) {
      appLogger.warn('inventory.reserved.underflow_clamped', {
        variantId: params.variantId,
        orderId: params.orderId,
        current,
        quantity: params.quantity,
      });
      return 0;
    }
    return current - params.quantity;
  }

  private async assertVariantOwned(userId: string, variantId: string): Promise<void> {
    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!variant) throw InventoryError.variantNotFound();
  }
}

export const inventoryServerService = new InventoryServerService();
