import 'server-only';

import { prisma } from '@olshop/db';
import { enqueuePropagateInventoryStock } from '@olshop/queue';
import type { MarketplaceConnection, Prisma } from '@prisma/client';

import { appLogger } from '@/lib/logger';
import { inventoryServerService } from '@/modules/inventory/services/inventory-server.service';
import { marketplaceMappingService } from '@/modules/marketplace/services/marketplace-mapping.service';
import { returnsServerService } from '@/modules/returns/services/returns-server.service';

import { getMarketplaceOrderAdapter } from '../adapters/order-adapter';
import { OrderError } from '../errors/order-errors';
import type { MultiPullOrdersResult, OrderDetail, OrderItemDetail, OrderListItem } from '../types';

/** Minimum gap between pulls from the same store, to curb API abuse. */
const PULL_COOLDOWN_MS = 30_000;

function isCoolingDown(lastPulledAt: Date | null): boolean {
  return lastPulledAt !== null && Date.now() - lastPulledAt.getTime() < PULL_COOLDOWN_MS;
}

export class OrdersServerService {
  async listOrders(userId: string): Promise<OrderListItem[]> {
    const orders = await prisma.order.findMany({
      where: { userId },
      include: {
        connection: { select: { shopName: true, lastOrdersPulledAt: true } },
        items: { select: { productVariantId: true } },
      },
      orderBy: { placedAt: 'desc' },
      take: 100,
    });

    return orders.map((order) => ({
      id: order.id,
      externalOrderId: order.externalOrderId,
      provider: order.provider,
      shopName: order.connection.shopName,
      status: order.status,
      buyerName: order.buyerName,
      noResi: order.noResi,
      totalAmount: order.totalAmount?.toString() ?? null,
      currency: order.currency,
      itemCount: order.items.length,
      unresolvedCount: order.items.filter((item) => item.productVariantId === null).length,
      inventoryApplied: order.inventoryAppliedAt !== null,
      fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
      placedAt: order.placedAt.toISOString(),
      lastPulledAt: order.connection.lastOrdersPulledAt?.toISOString() ?? null,
    }));
  }

  async getOrder(userId: string, orderId: string): Promise<OrderDetail> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        connection: { select: { shopName: true, lastOrdersPulledAt: true } },
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            productVariant: {
              select: { id: true, sku: true, name: true, product: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (!order) throw OrderError.notFound();

    const items: OrderItemDetail[] = order.items.map((item) => ({
      id: item.id,
      externalName: item.externalName,
      externalSku: item.externalSku,
      quantity: item.quantity,
      unitPrice: item.unitPrice?.toString() ?? null,
      resolved: item.productVariantId !== null,
      variant: item.productVariant
        ? {
            id: item.productVariant.id,
            sku: item.productVariant.sku,
            name: item.productVariant.name,
            productName: item.productVariant.product.name,
          }
        : null,
    }));

    return {
      id: order.id,
      externalOrderId: order.externalOrderId,
      provider: order.provider,
      shopName: order.connection.shopName,
      status: order.status,
      buyerName: order.buyerName,
      noResi: order.noResi,
      totalAmount: order.totalAmount?.toString() ?? null,
      currency: order.currency,
      itemCount: items.length,
      unresolvedCount: items.filter((item) => !item.resolved).length,
      inventoryApplied: order.inventoryAppliedAt !== null,
      fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
      placedAt: order.placedAt.toISOString(),
      lastPulledAt: order.connection.lastOrdersPulledAt?.toISOString() ?? null,
      items,
    };
  }

  /** The most recent order matching a tracking number — for the packing-station view. */
  async findByResi(userId: string, noResi: string): Promise<OrderDetail | null> {
    const order = await prisma.order.findFirst({
      where: { userId, noResi },
      orderBy: { placedAt: 'desc' },
      select: { id: true },
    });
    if (!order) return null;
    return this.getOrder(userId, order.id);
  }

  /**
   * Mark the order(s) with this tracking number as fulfilled (packed + recorded).
   * Idempotent — only stamps where `fulfilledAt` is null. Returns how many were
   * stamped. Called best-effort after a packing video completes.
   */
  async markFulfilledByResi(userId: string, noResi: string): Promise<number> {
    const result = await prisma.order.updateMany({
      where: { userId, noResi, fulfilledAt: null },
      data: { fulfilledAt: new Date() },
    });
    if (result.count > 0) {
      appLogger.info('orders.fulfilled', { userId, noResi, count: result.count });
    }
    return result.count;
  }

  /**
   * Map an unmapped order item to an internal variant: persist the listing→variant
   * mapping (so future pulls resolve), resolve every matching item in this order,
   * and — for a PAID order — reserve stock for the items just resolved.
   */
  async resolveOrderItem(
    userId: string,
    orderId: string,
    orderItemId: string,
    variantId: string,
  ): Promise<OrderDetail> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { items: true },
    });
    if (!order) throw OrderError.notFound();

    const item = order.items.find((entry) => entry.id === orderItemId);
    if (!item) throw OrderError.notFound('Order item not found.');

    await marketplaceMappingService.mapByExternalRef(
      userId,
      order.marketplaceConnectionId,
      {
        externalProductId: item.externalProductId,
        externalVariantId: item.externalVariantId,
        externalSku: item.externalSku,
        externalName: item.externalName,
        provider: order.provider,
      },
      variantId,
    );

    // Resolve every still-unmapped item in this order with the same external ref.
    const newlyResolved = order.items.filter(
      (entry) =>
        entry.productVariantId === null &&
        entry.externalProductId === item.externalProductId &&
        entry.externalVariantId === item.externalVariantId,
    );

    await prisma.orderItem.updateMany({
      where: { id: { in: newlyResolved.map((entry) => entry.id) } },
      data: { productVariantId: variantId },
    });

    // For a PAID order, reserve stock for the items just resolved (they were never
    // applied), stamping inventoryAppliedAt if it wasn't set yet.
    if (order.status === 'PAID' && newlyResolved.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const entry of newlyResolved) {
          await inventoryServerService.applyOrderReserveTx(tx, {
            userId,
            variantId,
            quantity: entry.quantity,
            orderId: order.id,
          });
        }
        if (order.inventoryAppliedAt === null) {
          await tx.order.update({
            where: { id: order.id },
            data: { inventoryAppliedAt: new Date() },
          });
        }
      });
      await this.propagateAffected(userId, new Set([variantId]), order.marketplaceConnectionId);
    }

    appLogger.info('orders.item.resolved', { userId, orderId, orderItemId, variantId });
    return this.getOrder(userId, orderId);
  }

  /**
   * Pull from several stores at once (default: every active store). Stores pulled
   * within the cooldown window are skipped (anti-abuse) rather than re-fetched.
   */
  async pullFromConnections(
    userId: string,
    connectionIds?: string[],
  ): Promise<MultiPullOrdersResult> {
    const connections = await prisma.marketplaceConnection.findMany({
      where: {
        userId,
        deletedAt: null,
        isActive: true,
        ...(connectionIds && connectionIds.length > 0 ? { id: { in: connectionIds } } : {}),
      },
    });

    let pulled = 0;
    let applied = 0;
    let shipped = 0;
    let reverted = 0;
    let storesPulled = 0;
    const storesSkipped: string[] = [];

    for (const connection of connections) {
      if (isCoolingDown(connection.lastOrdersPulledAt)) {
        storesSkipped.push(connection.shopName);
        continue;
      }

      const result = await this.pullOneConnection(userId, connection);
      await prisma.marketplaceConnection.update({
        where: { id: connection.id },
        data: { lastOrdersPulledAt: new Date() },
      });
      await this.propagateAffected(userId, result.affected, connection.id);

      pulled += result.pulled;
      applied += result.applied;
      shipped += result.shipped;
      reverted += result.reverted;
      storesPulled += 1;
    }

    appLogger.info('orders.pulled.multi', {
      userId,
      storesPulled,
      pulled,
      applied,
      shipped,
      reverted,
    });
    return { storesPulled, storesSkipped, pulled, applied, shipped, reverted };
  }

  private async pullOneConnection(
    userId: string,
    connection: MarketplaceConnection,
  ): Promise<{
    pulled: number;
    applied: number;
    shipped: number;
    reverted: number;
    affected: Set<string>;
  }> {
    const adapter = getMarketplaceOrderAdapter(connection.provider);
    const orders = await adapter.fetchOrders({ shopId: connection.shopId, accessToken: '' });

    let pulled = 0;
    let applied = 0;
    let shipped = 0;
    let reverted = 0;
    const affectedVariantIds = new Set<string>();

    for (const order of orders) {
      const resolvedItems = await Promise.all(
        order.items.map(async (item) => {
          const listing = await prisma.marketplaceProduct.findUnique({
            where: {
              marketplaceConnectionId_externalProductId_externalVariantId: {
                marketplaceConnectionId: connection.id,
                externalProductId: item.externalProductId,
                externalVariantId: item.externalVariantId,
              },
            },
            select: { mapping: { select: { productVariantId: true } } },
          });
          return { ...item, productVariantId: listing?.mapping?.productVariantId ?? null };
        }),
      );

      const saved = await prisma.$transaction(async (tx) => {
        const upserted = await tx.order.upsert({
          where: {
            marketplaceConnectionId_externalOrderId: {
              marketplaceConnectionId: connection.id,
              externalOrderId: order.externalOrderId,
            },
          },
          create: {
            userId,
            marketplaceConnectionId: connection.id,
            provider: connection.provider,
            externalOrderId: order.externalOrderId,
            status: order.status,
            noResi: order.noResi,
            buyerName: order.buyerName,
            totalAmount: order.totalAmount,
            currency: order.currency,
            rawPayload: order.raw as Prisma.InputJsonValue,
            placedAt: order.placedAt,
          },
          update: {
            status: order.status,
            noResi: order.noResi,
            buyerName: order.buyerName,
            totalAmount: order.totalAmount,
            currency: order.currency,
            rawPayload: order.raw as Prisma.InputJsonValue,
            placedAt: order.placedAt,
          },
        });

        await tx.orderItem.deleteMany({ where: { orderId: upserted.id } });
        await tx.orderItem.createMany({
          data: resolvedItems.map((item) => ({
            orderId: upserted.id,
            externalProductId: item.externalProductId,
            externalVariantId: item.externalVariantId,
            externalSku: item.externalSku,
            externalName: item.externalName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            productVariantId: item.productVariantId,
          })),
        });

        return upserted;
      });
      pulled += 1;

      // Inbound stock lifecycle, advanced at most once per stage (idempotent via the
      // order's inventory* timestamps). Operates on the current resolved line items
      // (assumes the marketplace doesn't change items after payment).
      const wasReserved = saved.inventoryAppliedAt !== null;
      const wasShipped = saved.inventoryShippedAt !== null;
      const wasReleased = saved.inventoryRevertedAt !== null;
      const isPaidOrBeyond =
        saved.status === 'PAID' || saved.status === 'SHIPPED' || saved.status === 'COMPLETED';
      const isShippedStatus = saved.status === 'SHIPPED' || saved.status === 'COMPLETED';
      const hasResolvedItems = resolvedItems.some((item) => item.productVariantId !== null);

      let reservedNow = wasReserved;

      // RESERVE: paid → commit stock (available−, reserved+). Also covers an order
      // first seen already SHIPPED (it reserves here, then ships just below).
      if (isPaidOrBeyond && !wasReserved && !wasReleased && hasResolvedItems) {
        await prisma.$transaction(async (tx) => {
          for (const item of resolvedItems) {
            if (!item.productVariantId) continue;
            await inventoryServerService.applyOrderReserveTx(tx, {
              userId,
              variantId: item.productVariantId,
              quantity: item.quantity,
              orderId: saved.id,
            });
            affectedVariantIds.add(item.productVariantId);
          }
          await tx.order.update({
            where: { id: saved.id },
            data: { inventoryAppliedAt: new Date() },
          });
        });
        applied += 1;
        reservedNow = true;
      }

      if (isShippedStatus && reservedNow && !wasShipped && !wasReleased) {
        // SHIP: consume the reservation (reserved−). Available is unchanged, so the
        // shipped variants are intentionally NOT added to affectedVariantIds.
        await prisma.$transaction(async (tx) => {
          for (const item of resolvedItems) {
            if (!item.productVariantId) continue;
            await inventoryServerService.applyOrderShipTx(tx, {
              userId,
              variantId: item.productVariantId,
              quantity: item.quantity,
              orderId: saved.id,
            });
          }
          await tx.order.update({
            where: { id: saved.id },
            data: { inventoryShippedAt: new Date() },
          });
        });
        shipped += 1;
      } else if (saved.status === 'CANCELLED' && reservedNow && !wasShipped && !wasReleased) {
        // RELEASE: cancelled before shipping → give the reserved units back.
        await prisma.$transaction(async (tx) => {
          for (const item of resolvedItems) {
            if (!item.productVariantId) continue;
            await inventoryServerService.applyOrderReleaseTx(tx, {
              userId,
              variantId: item.productVariantId,
              quantity: item.quantity,
              orderId: saved.id,
            });
            affectedVariantIds.add(item.productVariantId);
          }
          await tx.order.update({
            where: { id: saved.id },
            data: { inventoryRevertedAt: new Date() },
          });
        });
        reverted += 1;
      } else if (saved.status === 'CANCELLED' && wasShipped) {
        // RETURN: cancelled after shipping. The reserved units already physically
        // left at ship time, so crediting available now would be phantom stock.
        // Open a return (idempotent) to track the goods coming back; stock only
        // moves once the return is processed. Best-effort — never fail the pull.
        try {
          await returnsServerService.createReturn(userId, saved.id, { autoDetected: true });
        } catch (error) {
          appLogger.warn('orders.return.autocreate_failed', {
            userId,
            orderId: saved.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return { pulled, applied, shipped, reverted, affected: affectedVariantIds };
  }

  /** Best-effort: push each decremented variant's new available stock to its other channels. */
  private async propagateAffected(
    userId: string,
    variantIds: Set<string>,
    connectionId: string,
  ): Promise<void> {
    for (const variantId of variantIds) {
      try {
        const inventory = await prisma.inventory.findUnique({
          where: { variantId },
          select: { availableStock: true },
        });
        await enqueuePropagateInventoryStock({
          userId,
          variantId,
          availableStock: inventory?.availableStock ?? 0,
          eventId: `order-${connectionId}-${variantId}-${Date.now()}`,
          // Don't re-sync the channel the order came from against its own change.
          excludeConnectionId: connectionId,
        });
      } catch (error) {
        appLogger.warn('orders.propagate.enqueue_failed', {
          userId,
          variantId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

export const ordersServerService = new OrdersServerService();
