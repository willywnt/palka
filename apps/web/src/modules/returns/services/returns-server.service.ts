import 'server-only';

import { prisma } from '@olshop/db';
import { enqueuePropagateInventoryStock } from '@olshop/queue';
import type { Prisma } from '@prisma/client';

import { appLogger } from '@/lib/logger';
import { inventoryServerService } from '@/modules/inventory/services/inventory-server.service';

import { ReturnError } from '../errors/return-errors';
import type { ListReturnsQuery } from '../validators/list-returns';
import type { ProcessReturnInput } from '../validators/process-return';
import type { ReturnDetail, ReturnItemDetail, ReturnListItem } from '../types';

const DETAIL_INCLUDE = {
  items: true,
  order: {
    select: {
      externalOrderId: true,
      provider: true,
      connection: { select: { shopName: true } },
      items: {
        select: {
          id: true,
          externalName: true,
          productVariant: {
            select: {
              sku: true,
              name: true,
              imageUrl: true,
              product: { select: { name: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ReturnInclude;

type ReturnRow = Prisma.ReturnGetPayload<{ include: typeof DETAIL_INCLUDE }>;

function mapDetail(row: ReturnRow): ReturnDetail {
  const orderItems = new Map(row.order.items.map((item) => [item.id, item]));

  const items: ReturnItemDetail[] = row.items.map((item) => {
    const orderItem = orderItems.get(item.orderItemId);
    return {
      id: item.id,
      orderItemId: item.orderItemId,
      productVariantId: item.productVariantId,
      sku: orderItem?.productVariant?.sku ?? null,
      variantName: orderItem?.productVariant?.name ?? null,
      productName: orderItem?.productVariant?.product.name ?? null,
      imageUrl: orderItem?.productVariant?.imageUrl ?? null,
      externalName: orderItem?.externalName ?? '(removed line)',
      quantity: item.quantity,
      disposition: item.disposition,
    };
  });

  return {
    id: row.id,
    orderId: row.orderId,
    externalOrderId: row.order.externalOrderId,
    provider: row.order.provider,
    shopName: row.order.connection.shopName,
    status: row.status,
    noResi: row.noResi,
    reason: row.reason,
    autoDetected: row.autoDetected,
    itemCount: row.items.length,
    createdAt: row.createdAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
    items,
  };
}

/**
 * Owns the RMA flow: a return is opened (auto on a detected post-ship cancellation
 * or manually) in PENDING, then processed once goods arrive — each item routed to
 * RESTOCK (back to available) or DAMAGED (into damaged stock). Stock moves ONLY at
 * processing time, through the inventory service, so we never over-credit.
 */
export class ReturnsServerService {
  async listReturns(userId: string, query: ListReturnsQuery): Promise<ReturnListItem[]> {
    const rows = await prisma.return.findMany({
      where: { userId, ...(query.status ? { status: query.status } : {}) },
      include: {
        order: {
          select: {
            externalOrderId: true,
            provider: true,
            connection: { select: { shopName: true } },
          },
        },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      externalOrderId: row.order.externalOrderId,
      provider: row.order.provider,
      shopName: row.order.connection.shopName,
      status: row.status,
      noResi: row.noResi,
      reason: row.reason,
      autoDetected: row.autoDetected,
      itemCount: row._count.items,
      createdAt: row.createdAt.toISOString(),
      processedAt: row.processedAt?.toISOString() ?? null,
    }));
  }

  async getReturn(userId: string, returnId: string): Promise<ReturnDetail> {
    const row = await prisma.return.findFirst({
      where: { id: returnId, userId },
      include: DETAIL_INCLUDE,
    });
    if (!row) throw ReturnError.notFound();
    return mapDetail(row);
  }

  /**
   * Open a return for an order whose goods have shipped. Idempotent: if a return
   * already exists for the order, the existing one is returned (so auto-detect on a
   * re-pull never duplicates). Seeds one PENDING line per resolved order item.
   */
  async createReturn(
    userId: string,
    orderId: string,
    opts: { reason?: string; autoDetected?: boolean } = {},
  ): Promise<ReturnDetail> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { items: true },
    });
    if (!order) throw ReturnError.notFound('Order not found.');
    if (order.inventoryShippedAt === null) {
      throw ReturnError.validation('A return can only be opened after the order has shipped.');
    }

    const existing = await prisma.return.findFirst({ where: { orderId, userId } });
    if (existing) return this.getReturn(userId, existing.id);

    const resolvedItems = order.items.filter((item) => item.productVariantId !== null);
    if (resolvedItems.length === 0) {
      throw ReturnError.validation('Order has no resolved items to return.');
    }

    const created = await prisma.return.create({
      data: {
        userId,
        orderId,
        reason: opts.reason ?? null,
        autoDetected: opts.autoDetected ?? false,
        noResi: order.noResi,
        items: {
          create: resolvedItems.map((item) => ({
            orderItemId: item.id,
            productVariantId: item.productVariantId,
            quantity: item.quantity,
          })),
        },
      },
    });

    appLogger.info('returns.created', {
      userId,
      returnId: created.id,
      orderId,
      autoDetected: opts.autoDetected ?? false,
    });
    return this.getReturn(userId, created.id);
  }

  /**
   * Receive a PENDING return: route each line to available (RESTOCK) or damaged
   * (DAMAGED), in one transaction, then mark RECEIVED. Restocked variants are
   * propagated to marketplaces afterwards (best-effort).
   */
  async processReturn(
    userId: string,
    returnId: string,
    input: ProcessReturnInput,
  ): Promise<ReturnDetail> {
    const ret = await prisma.return.findFirst({
      where: { id: returnId, userId },
      include: { items: true },
    });
    if (!ret) throw ReturnError.notFound();
    if (ret.status !== 'PENDING')
      throw ReturnError.validation('This return has already been processed.');

    const itemsById = new Map(ret.items.map((item) => [item.id, item]));
    const dispositionById = new Map(
      input.lines.map((line) => [line.returnItemId, line.disposition]),
    );

    if (
      input.lines.length !== ret.items.length ||
      ret.items.some((item) => !dispositionById.has(item.id))
    ) {
      throw ReturnError.validation('Every return item needs a disposition.');
    }
    for (const line of input.lines) {
      if (!itemsById.has(line.returnItemId)) throw ReturnError.validation('Unknown return item.');
    }

    const restocked = new Set<string>();

    await prisma.$transaction(async (tx) => {
      for (const item of ret.items) {
        const disposition = dispositionById.get(item.id)!;
        if (item.productVariantId) {
          if (disposition === 'RESTOCK') {
            await inventoryServerService.applyReturnRestockTx(tx, {
              userId,
              variantId: item.productVariantId,
              quantity: item.quantity,
              returnId,
            });
            restocked.add(item.productVariantId);
          } else {
            await inventoryServerService.applyReturnDamagedTx(tx, {
              userId,
              variantId: item.productVariantId,
              quantity: item.quantity,
              returnId,
            });
          }
        }
        await tx.returnItem.update({ where: { id: item.id }, data: { disposition } });
      }
      await tx.return.update({
        where: { id: returnId },
        data: { status: 'RECEIVED', processedAt: new Date() },
      });
    });

    appLogger.info('returns.processed', { userId, returnId, restockedVariants: restocked.size });
    await this.propagateRestocked(userId, restocked);
    return this.getReturn(userId, returnId);
  }

  /** Close a return without restocking (goods not returned / dispute lost). */
  async rejectReturn(userId: string, returnId: string): Promise<ReturnDetail> {
    const ret = await prisma.return.findFirst({ where: { id: returnId, userId } });
    if (!ret) throw ReturnError.notFound();
    if (ret.status !== 'PENDING')
      throw ReturnError.validation('This return has already been processed.');

    await prisma.return.update({
      where: { id: returnId },
      data: { status: 'REJECTED', processedAt: new Date() },
    });
    appLogger.info('returns.rejected', { userId, returnId });
    return this.getReturn(userId, returnId);
  }

  /** Variant ids (from the given set) referenced by a still-open (PENDING) return. */
  async getVariantIdsWithOpenReturns(userId: string, variantIds: string[]): Promise<Set<string>> {
    if (variantIds.length === 0) return new Set();
    const rows = await prisma.returnItem.findMany({
      where: {
        productVariantId: { in: variantIds },
        return: { userId, status: 'PENDING' },
      },
      select: { productVariantId: true },
    });
    return new Set(
      rows.map((row) => row.productVariantId).filter((id): id is string => id !== null),
    );
  }

  /** Best-effort: push each restocked variant's new available stock to all channels. */
  private async propagateRestocked(userId: string, variantIds: Set<string>): Promise<void> {
    for (const variantId of variantIds) {
      try {
        const syncEnabledCount = await prisma.marketplaceProductMapping.count({
          where: { productVariantId: variantId, userId, syncEnabled: true },
        });
        if (syncEnabledCount === 0) continue;

        const inventory = await prisma.inventory.findUnique({
          where: { variantId },
          select: { availableStock: true },
        });
        await enqueuePropagateInventoryStock({
          userId,
          variantId,
          availableStock: inventory?.availableStock ?? 0,
          eventId: `return-${variantId}-${Date.now()}`,
        });
      } catch (error) {
        appLogger.warn('returns.propagate.enqueue_failed', {
          userId,
          variantId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

export const returnsServerService = new ReturnsServerService();
