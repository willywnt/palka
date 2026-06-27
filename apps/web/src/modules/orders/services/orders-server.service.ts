import 'server-only';

import {
  buildPaginatedResult,
  prisma,
  type PaginatedResult,
  type TransactionClient,
} from '@falka/db';
import { enqueuePropagateInventoryStock } from '@falka/queue';
import type { MarketplaceConnection, MarketplaceProvider, Prisma } from '@prisma/client';

import { appLogger } from '@/lib/logger';
import { inventoryServerService } from '@/modules/inventory/services/inventory-server.service';
import { marketplaceEncryptionService } from '@/modules/marketplace/services/encryption.service';
import { marketplaceMappingService } from '@/modules/marketplace/services/marketplace-mapping.service';
import { notificationServerService } from '@/modules/notifications/services/notification-server.service';
import { returnsServerService } from '@/modules/returns/services/returns-server.service';

import { getMarketplaceOrderAdapter } from '../adapters/order-adapter';
import { OrderError } from '../errors/order-errors';
import { extractOrderItemMedia, extractOrderMarketplaceMeta } from '../utils/marketplace-meta';
import type { ListOrdersQuery } from '../validators/list-orders';
import type { MultiPullOrdersResult, OrderDetail, OrderItemDetail, OrderListItem } from '../types';

/** Minimum gap between pulls from the SAME store, to curb API abuse. Per-provider so each
 *  channel's rate limits can be tuned independently; DEFAULT covers any unlisted provider. */
const DEFAULT_PULL_COOLDOWN_MS = 30_000;
const PULL_COOLDOWN_MS_BY_PROVIDER: Partial<Record<MarketplaceProvider, number>> = {
  LAZADA: 30_000,
};

function isCoolingDown(provider: MarketplaceProvider, lastPulledAt: Date | null): boolean {
  if (lastPulledAt === null) return false;
  const cooldown = PULL_COOLDOWN_MS_BY_PROVIDER[provider] ?? DEFAULT_PULL_COOLDOWN_MS;
  return Date.now() - lastPulledAt.getTime() < cooldown;
}

/** Stable map key for a marketplace listing (external product + variant). */
function listingKey(externalProductId: string, externalVariantId: string): string {
  return JSON.stringify([externalProductId, externalVariantId]);
}

/** Normalize a SKU for the case-insensitive seller-SKU fallback (exact match only, never fuzzy). */
function normalizeSkuKey(sku: string | null): string | null {
  const trimmed = sku?.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

export class OrdersServerService {
  async listOrders(
    organizationId: string,
    query: ListOrdersQuery,
  ): Promise<PaginatedResult<OrderListItem>> {
    const where: Prisma.OrderWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.connectionId ? { marketplaceConnectionId: query.connectionId } : {}),
      ...(query.search
        ? {
            OR: [
              { externalOrderId: { contains: query.search, mode: 'insensitive' } },
              { noResi: { contains: query.search, mode: 'insensitive' } },
              { buyerName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          connection: { select: { shopName: true, lastOrdersPulledAt: true } },
          items: { select: { productVariantId: true } },
        },
        // Most-recently-changed first, by the marketplace's own update time; orders pulled
        // before that was captured (externalUpdatedAt null) fall to the bottom, tie-broken by
        // when they were placed.
        orderBy: [
          { externalUpdatedAt: { sort: 'desc', nulls: 'last' } },
          { placedAt: 'desc' },
          // Unique final tiebreak so offset pagination is stable when the dates collide.
          { id: 'desc' },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.order.count({ where }),
    ]);

    const items = orders.map((order) => ({
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
      inventoryShipped: order.inventoryShippedAt !== null,
      inventoryReverted: order.inventoryRevertedAt !== null,
      fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
      placedAt: order.placedAt.toISOString(),
      updatedAt: order.externalUpdatedAt?.toISOString() ?? null,
      lastPulledAt: order.connection.lastOrdersPulledAt?.toISOString() ?? null,
    }));

    return buildPaginatedResult(items, total, query.page, query.pageSize);
  }

  async getOrder(organizationId: string, orderId: string): Promise<OrderDetail> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, organizationId },
      include: {
        connection: { select: { shopName: true, lastOrdersPulledAt: true } },
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            productVariant: {
              select: {
                id: true,
                sku: true,
                name: true,
                imageUrl: true,
                product: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!order) throw OrderError.notFound();

    const itemMedia = extractOrderItemMedia(order.rawPayload);
    const items: OrderItemDetail[] = order.items.map((item) => ({
      id: item.id,
      externalName: item.externalName,
      externalSku: item.externalSku,
      quantity: item.quantity,
      unitPrice: item.unitPrice?.toString() ?? null,
      externalImageUrl: itemMedia.get(item.externalVariantId)?.imageUrl ?? null,
      externalDetailUrl: itemMedia.get(item.externalVariantId)?.detailUrl ?? null,
      resolved: item.productVariantId !== null,
      variant: item.productVariant
        ? {
            id: item.productVariant.id,
            sku: item.productVariant.sku,
            name: item.productVariant.name,
            productName: item.productVariant.product.name,
            imageUrl: item.productVariant.imageUrl,
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
      inventoryShipped: order.inventoryShippedAt !== null,
      inventoryReverted: order.inventoryRevertedAt !== null,
      fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
      placedAt: order.placedAt.toISOString(),
      updatedAt: order.externalUpdatedAt?.toISOString() ?? null,
      lastPulledAt: order.connection.lastOrdersPulledAt?.toISOString() ?? null,
      cancelReason: order.cancelReason,
      marketplace: extractOrderMarketplaceMeta(order.rawPayload),
      items,
    };
  }

  /**
   * The most recent order matching a tracking number — for the packing-station
   * view. Matched case-insensitively (resi/tracking numbers are case-insensitive;
   * the scanner uppercases while marketplaces may not).
   */
  async findByResi(organizationId: string, noResi: string): Promise<OrderDetail | null> {
    const order = await prisma.order.findFirst({
      where: { organizationId, noResi: { equals: noResi, mode: 'insensitive' } },
      orderBy: { placedAt: 'desc' },
      select: { id: true },
    });
    if (!order) return null;
    return this.getOrder(organizationId, order.id);
  }

  /**
   * Mark the order(s) with this tracking number as fulfilled (packed + recorded).
   * Idempotent — only stamps where `fulfilledAt` is null. Matched case-insensitively
   * (see findByResi). Returns how many were stamped. Called best-effort after a
   * packing video completes.
   */
  async markFulfilledByResi(organizationId: string, noResi: string): Promise<number> {
    // An order is "fulfilled" only when a COMPLETED packing video actually exists for its resi.
    // Marking shipped / setting a resi must NOT fake fulfillment when no video was recorded —
    // it just retroactively links a video that already exists. (Fulfillment is the order↔
    // recording noResi join; recordings already calls in here, so reading the Recording table
    // here keeps that cross-cut in one place without a circular service dependency.)
    const videoCount = await prisma.recording.count({
      where: {
        organizationId,
        noResi: { equals: noResi, mode: 'insensitive' },
        status: 'COMPLETED',
        deletedAt: null,
      },
    });
    if (videoCount === 0) return 0;

    const result = await prisma.order.updateMany({
      where: { organizationId, noResi: { equals: noResi, mode: 'insensitive' }, fulfilledAt: null },
      data: { fulfilledAt: new Date() },
    });
    if (result.count > 0) {
      appLogger.info('orders.fulfilled', { organizationId, noResi, count: result.count });
    }
    return result.count;
  }

  /**
   * Map an unmapped order item to an internal variant: persist the listing→variant
   * mapping (so future pulls resolve), resolve every matching item in this order,
   * and — for a PAID order — reserve stock for the items just resolved.
   */
  async resolveOrderItem(
    organizationId: string,
    actorUserId: string,
    orderId: string,
    orderItemId: string,
    variantId: string,
  ): Promise<OrderDetail> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, organizationId },
      include: { items: true },
    });
    if (!order) throw OrderError.notFound();

    const item = order.items.find((entry) => entry.id === orderItemId);
    if (!item) throw OrderError.notFound('Order item not found.');

    await marketplaceMappingService.mapByExternalRef(
      organizationId,
      actorUserId,
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
            organizationId,
            actorUserId,
            variantId,
            quantity: entry.quantity,
            orderId: order.id,
          });
        }
        await this.snapshotOrderItemCostsTx(tx, order.id, [variantId]);
        if (order.inventoryAppliedAt === null) {
          await tx.order.update({
            where: { id: order.id },
            data: { inventoryAppliedAt: new Date() },
          });
        }
      });
      await this.propagateAffected(
        organizationId,
        actorUserId,
        new Set([variantId]),
        order.marketplaceConnectionId,
      );
    }

    appLogger.info('orders.item.resolved', {
      organizationId,
      actorUserId,
      orderId,
      orderItemId,
      variantId,
    });
    return this.getOrder(organizationId, orderId);
  }

  /**
   * Manually mark a PAID order as shipped: consume the reservation for every resolved
   * line (available unchanged) and stamp `inventoryShippedAt`, set status SHIPPED, and
   * optionally set/update the tracking number. Idempotent via `inventoryShippedAt`.
   * Best-effort re-runs the noResi → packing-video fulfillment match afterwards.
   */
  async markOrderShipped(
    organizationId: string,
    actorUserId: string,
    orderId: string,
    input: { noResi?: string } = {},
  ): Promise<OrderDetail> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, organizationId },
      include: { items: true },
    });
    if (!order) throw OrderError.notFound();
    if (order.inventoryShippedAt !== null) {
      throw OrderError.validation('This order is already marked shipped.');
    }
    if (order.status !== 'PAID') {
      throw OrderError.validation('Only a paid order can be marked shipped.');
    }
    if (order.inventoryAppliedAt === null) {
      throw OrderError.validation(
        'Stock is not reserved for this order yet — map every item first, then pull or resolve.',
      );
    }

    const noResi = input.noResi ?? order.noResi;

    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        if (!item.productVariantId) continue;
        await inventoryServerService.applyOrderShipTx(tx, {
          organizationId,
          actorUserId,
          variantId: item.productVariantId,
          quantity: item.quantity,
          orderId: order.id,
        });
      }
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'SHIPPED', inventoryShippedAt: new Date(), noResi },
      });
    });

    // The order is packed-and-shipped now; stamp fulfillment if a video already exists.
    if (noResi) await this.markFulfilledByResi(organizationId, noResi);
    appLogger.info('orders.marked_shipped', {
      organizationId,
      actorUserId,
      orderId,
      hasResi: Boolean(noResi),
    });
    return this.getOrder(organizationId, orderId);
  }

  /**
   * Set or update an order's tracking number (an offline shipment, or a missing resi),
   * then re-run the noResi → packing-video fulfillment match. NOTE: a later marketplace
   * re-pull may overwrite this for a marketplace-sourced order.
   */
  async setOrderResi(
    organizationId: string,
    orderId: string,
    noResi: string,
  ): Promise<OrderDetail> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, organizationId },
      select: { id: true },
    });
    if (!order) throw OrderError.notFound();

    await prisma.order.update({ where: { id: orderId }, data: { noResi } });
    await this.markFulfilledByResi(organizationId, noResi);
    appLogger.info('orders.resi_updated', { organizationId, orderId });
    return this.getOrder(organizationId, orderId);
  }

  /**
   * Manually cancel an order BEFORE it ships. If stock was reserved, release it back to
   * available (reversing the reservation) and stamp `inventoryRevertedAt`; always set
   * status CANCELLED + the reason. A shipped order can't be cancelled here — that's a
   * return (goods coming back). Idempotent via `inventoryRevertedAt`; released variants
   * propagate to the other channels.
   */
  async cancelOrder(
    organizationId: string,
    actorUserId: string,
    orderId: string,
    input: { reason?: string } = {},
  ): Promise<OrderDetail> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, organizationId },
      include: { items: true },
    });
    if (!order) throw OrderError.notFound();
    if (order.inventoryShippedAt !== null) {
      throw OrderError.validation(
        'This order already shipped — open a return to bring the goods back instead of cancelling.',
      );
    }
    if (order.status === 'CANCELLED') {
      throw OrderError.validation('This order is already cancelled.');
    }
    if (order.status === 'COMPLETED') {
      throw OrderError.validation('A completed order cannot be cancelled.');
    }

    const reason = input.reason?.trim() || null;
    const shouldRelease = order.inventoryAppliedAt !== null && order.inventoryRevertedAt === null;
    const released = new Set<string>();

    await prisma.$transaction(async (tx) => {
      if (shouldRelease) {
        for (const item of order.items) {
          if (!item.productVariantId) continue;
          await inventoryServerService.applyOrderReleaseTx(tx, {
            organizationId,
            actorUserId,
            variantId: item.productVariantId,
            quantity: item.quantity,
            orderId: order.id,
          });
          released.add(item.productVariantId);
        }
      }
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          cancelReason: reason,
          ...(shouldRelease ? { inventoryRevertedAt: new Date() } : {}),
        },
      });
    });

    if (released.size > 0) {
      await this.propagateAffected(
        organizationId,
        actorUserId,
        released,
        order.marketplaceConnectionId,
      );
    }
    appLogger.info('orders.cancelled', {
      organizationId,
      actorUserId,
      orderId,
      released: released.size,
    });
    return this.getOrder(organizationId, orderId);
  }

  /**
   * Pull from several stores at once (default: every active store). Stores pulled
   * within the cooldown window are skipped (anti-abuse) rather than re-fetched.
   */
  async pullFromConnections(
    organizationId: string,
    actorUserId: string,
    options: { connectionIds?: string[]; full?: boolean } = {},
  ): Promise<MultiPullOrdersResult> {
    const { connectionIds, full } = options;
    const connections = await prisma.marketplaceConnection.findMany({
      where: {
        organizationId,
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
      if (isCoolingDown(connection.provider, connection.lastOrdersPulledAt)) {
        storesSkipped.push(connection.shopName);
        continue;
      }

      const result = await this.pullAndApplyConnection(connection, actorUserId, full ?? false);
      pulled += result.pulled;
      applied += result.applied;
      shipped += result.shipped;
      reverted += result.reverted;
      storesPulled += 1;
    }

    appLogger.info('orders.pulled.multi', {
      organizationId,
      actorUserId,
      storesPulled,
      pulled,
      applied,
      shipped,
      reverted,
    });
    return { storesPulled, storesSkipped, pulled, applied, shipped, reverted };
  }

  /**
   * Pull one connection, advance its cursor + cooldown stamp, and propagate affected stock.
   * Shared by the manual multi-pull and the scheduled auto-pull. The cursor advances to the
   * moment the pull STARTED (the adapter applies an overlap next run) so an order changed
   * mid-pull is never skipped; lastOrdersPulledAt stays the cooldown/display stamp.
   */
  private async pullAndApplyConnection(
    connection: MarketplaceConnection,
    actorUserId: string,
    full: boolean,
  ): Promise<{ pulled: number; applied: number; shipped: number; reverted: number }> {
    const pullStartedAt = new Date();
    const result = await this.pullOneConnection(
      connection.organizationId,
      actorUserId,
      connection,
      full,
    );
    await prisma.marketplaceConnection.update({
      where: { id: connection.id },
      data: {
        lastOrdersPulledAt: new Date(),
        // Advance the incremental cursor ONLY when the pull saw the whole window. A truncated
        // (throttled/page-capped) pull leaves it put so the next run re-covers the un-fetched,
        // newest-updated tail instead of skipping it forever.
        ...(result.complete ? { ordersSyncedThrough: pullStartedAt } : {}),
      },
    });
    await this.propagateAffected(
      connection.organizationId,
      actorUserId,
      result.affected,
      connection.id,
    );
    return {
      pulled: result.pulled,
      applied: result.applied,
      shipped: result.shipped,
      reverted: result.reverted,
    };
  }

  /**
   * Pull EVERY active store across all orgs — the VPS custom-server scheduler calls this on an
   * interval (dormant on Vercel, where the custom server doesn't run). Per connection: honours
   * the per-provider cooldown, uses the connection's own creator as the actor, and never lets
   * one store's failure abort the rest. Incremental only (a full backfill stays a manual action).
   */
  async runScheduledPull(): Promise<{ storesPulled: number; pulled: number }> {
    const connections = await prisma.marketplaceConnection.findMany({
      where: { deletedAt: null, isActive: true },
    });

    let storesPulled = 0;
    let pulled = 0;
    for (const connection of connections) {
      if (isCoolingDown(connection.provider, connection.lastOrdersPulledAt)) continue;
      try {
        const result = await this.pullAndApplyConnection(connection, connection.userId, false);
        pulled += result.pulled;
        storesPulled += 1;
      } catch (error) {
        appLogger.warn('orders.scheduled_pull.connection_failed', {
          connectionId: connection.id,
          organizationId: connection.organizationId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (storesPulled > 0) appLogger.info('orders.scheduled_pull', { storesPulled, pulled });
    return { storesPulled, pulled };
  }

  /**
   * Resolve the mapped internal variant id for every order line in ONE pair of queries,
   * keyed two ways: `byListing` (listingKey(externalProductId, externalVariantId), the
   * primary join) and `bySku` (normalized seller SKU → variant, a fallback for providers
   * like Lazada whose order lines don't carry the listing's external variant id). Unmapped
   * or unknown listings are simply absent (callers default to null). Replaces an N×M
   * per-item findUnique across the whole pull.
   */
  private async resolveOrderItemVariantIds(
    connectionId: string,
    orders: ReadonlyArray<{
      items: ReadonlyArray<{
        externalProductId: string;
        externalVariantId: string;
        externalSku: string | null;
      }>;
    }>,
  ): Promise<{ byListing: Map<string, string>; bySku: Map<string, string> }> {
    const byListing = new Map<string, string>();
    const bySku = new Map<string, string>();

    const pairs = orders.flatMap((order) =>
      order.items.map((item) => ({
        externalProductId: item.externalProductId,
        externalVariantId: item.externalVariantId,
      })),
    );

    if (pairs.length > 0) {
      const listings = await prisma.marketplaceProduct.findMany({
        where: { marketplaceConnectionId: connectionId, OR: pairs },
        select: {
          externalProductId: true,
          externalVariantId: true,
          mapping: { select: { productVariantId: true } },
        },
      });
      for (const listing of listings) {
        const variantId = listing.mapping?.productVariantId;
        if (variantId) {
          byListing.set(
            listingKey(listing.externalProductId, listing.externalVariantId),
            variantId,
          );
        }
      }
    }

    // Fallback: map the connection's mapped listings by normalized externalSku, so an order
    // line that didn't match on (product, variant) ids can still resolve by its seller SKU.
    const hasSku = orders.some((order) => order.items.some((item) => item.externalSku));
    if (hasSku) {
      const mapped = await prisma.marketplaceProduct.findMany({
        where: {
          marketplaceConnectionId: connectionId,
          externalSku: { not: null },
          mapping: { isNot: null },
        },
        select: { externalSku: true, mapping: { select: { productVariantId: true } } },
      });
      // externalSku is NOT unique per connection — two listings can share a seller SKU yet map
      // to DIFFERENT internal variants. Resolving such a key to whichever row came back first
      // would silently reserve the wrong variant's stock, so mark it AMBIGUOUS and drop it (the
      // line stays unresolved + surfaced via unresolvedCount instead of a wrong guess).
      const ambiguousSkus = new Set<string>();
      for (const listing of mapped) {
        const key = normalizeSkuKey(listing.externalSku);
        const variantId = listing.mapping?.productVariantId;
        if (!key || !variantId) continue;
        const existing = bySku.get(key);
        if (existing === undefined) bySku.set(key, variantId);
        else if (existing !== variantId) ambiguousSkus.add(key);
      }
      for (const key of ambiguousSkus) bySku.delete(key);
    }

    return { byListing, bySku };
  }

  private async pullOneConnection(
    organizationId: string,
    actorUserId: string,
    connection: MarketplaceConnection,
    full = false,
  ): Promise<{
    pulled: number;
    applied: number;
    shipped: number;
    reverted: number;
    affected: Set<string>;
    /** False when the provider truncated the window — caller must not advance the cursor. */
    complete: boolean;
  }> {
    const adapter = getMarketplaceOrderAdapter(connection.provider);
    const { orders, complete } = await adapter.fetchOrders({
      shopId: connection.shopId,
      shopCipher: connection.externalShopCipher,
      // Stub adapters ignore these; a real adapter decrypts the connection token and pulls the
      // window since this store's last pull (idempotent upserts make the overlap safe).
      accessToken:
        marketplaceEncryptionService.safeDecryptToken(connection.encryptedAccessToken) ?? '',
      // The incremental window comes from the dedicated cursor, not the cooldown timestamp.
      // A full re-pull ignores the cursor and uses the adapter's backfill window instead.
      since: full ? undefined : (connection.ordersSyncedThrough ?? undefined),
      full,
    });

    let pulled = 0;
    let applied = 0;
    let shipped = 0;
    let reverted = 0;
    const affectedVariantIds = new Set<string>();

    // Resolve every line's mapped variant in ONE pair of queries for the whole pull, then
    // look each up below — was an N×M per-item findUnique (N orders × M items).
    const { byListing, bySku } = await this.resolveOrderItemVariantIds(connection.id, orders);

    for (const order of orders) {
      const resolvedItems = order.items.map((item) => {
        const skuKey = normalizeSkuKey(item.externalSku);
        return {
          ...item,
          productVariantId:
            byListing.get(listingKey(item.externalProductId, item.externalVariantId)) ??
            (skuKey ? (bySku.get(skuKey) ?? null) : null),
        };
      });

      // Per-line status from THIS pull (Lazada reports status per item) — lets the ship stage
      // release a line cancelled inside an otherwise-shipped order instead of consuming it.
      const lineStatusByKey = new Map(
        order.items.map((item) => [
          listingKey(item.externalProductId, item.externalVariantId),
          item.status,
        ]),
      );

      const { order: saved, items: lifecycleItems } = await prisma.$transaction(async (tx) => {
        const upserted = await tx.order.upsert({
          where: {
            marketplaceConnectionId_externalOrderId: {
              marketplaceConnectionId: connection.id,
              externalOrderId: order.externalOrderId,
            },
          },
          create: {
            userId: actorUserId,
            organizationId,
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
            externalUpdatedAt: order.updatedAt,
          },
          update: {
            status: order.status,
            noResi: order.noResi,
            buyerName: order.buyerName,
            totalAmount: order.totalAmount,
            currency: order.currency,
            rawPayload: order.raw as Prisma.InputJsonValue,
            // placedAt is the immutable placement instant — never re-write it (a parse-fallback
            // 'now' would otherwise drift it forward each pull); set it only on create.
            externalUpdatedAt: order.updatedAt,
          },
        });

        // Once an order is reserved its line set is FROZEN: a re-pull must not change the
        // reserved qty/variant or wipe the COGS snapshot (those drive stock + profit). Carry the
        // persisted values forward; only FILL a still-null variant from a fresh (late) resolution.
        const existingByKey = new Map<
          string,
          { productVariantId: string | null; quantity: number; unitCost: Prisma.Decimal | null }
        >();
        if (upserted.inventoryAppliedAt !== null) {
          const existing = await tx.orderItem.findMany({
            where: { orderId: upserted.id },
            select: {
              externalProductId: true,
              externalVariantId: true,
              productVariantId: true,
              quantity: true,
              unitCost: true,
            },
          });
          for (const item of existing) {
            existingByKey.set(listingKey(item.externalProductId, item.externalVariantId), {
              productVariantId: item.productVariantId,
              quantity: item.quantity,
              unitCost: item.unitCost,
            });
          }
        }

        const items = resolvedItems.map((item) => {
          const frozen = existingByKey.get(
            listingKey(item.externalProductId, item.externalVariantId),
          );
          if (frozen) {
            const productVariantId = frozen.productVariantId ?? item.productVariantId;
            return {
              ...item,
              quantity: frozen.quantity,
              unitCost: frozen.unitCost,
              productVariantId,
              lateResolved: frozen.productVariantId === null && productVariantId !== null,
            };
          }
          return { ...item, unitCost: null as Prisma.Decimal | null, lateResolved: false };
        });

        await tx.orderItem.deleteMany({ where: { orderId: upserted.id } });
        await tx.orderItem.createMany({
          data: items.map((item) => ({
            orderId: upserted.id,
            externalProductId: item.externalProductId,
            externalVariantId: item.externalVariantId,
            externalSku: item.externalSku,
            externalName: item.externalName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unitCost: item.unitCost,
            productVariantId: item.productVariantId,
          })),
        });

        return { order: upserted, items };
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
      const hasResolvedItems = lifecycleItems.some((item) => item.productVariantId !== null);

      let reservedNow = wasReserved;

      // RESERVE: paid → commit stock (available−, reserved+). Also covers an order
      // first seen already SHIPPED (it reserves here, then ships just below).
      if (isPaidOrBeyond && !wasReserved && !wasReleased && hasResolvedItems) {
        await prisma.$transaction(async (tx) => {
          const reservedVariantIds: string[] = [];
          for (const item of lifecycleItems) {
            if (!item.productVariantId) continue;
            await inventoryServerService.applyOrderReserveTx(tx, {
              organizationId,
              actorUserId,
              variantId: item.productVariantId,
              quantity: item.quantity,
              orderId: saved.id,
            });
            affectedVariantIds.add(item.productVariantId);
            reservedVariantIds.push(item.productVariantId);
          }
          await this.snapshotOrderItemCostsTx(tx, saved.id, reservedVariantIds);
          await tx.order.update({
            where: { id: saved.id },
            data: { inventoryAppliedAt: new Date() },
          });
        });
        applied += 1;
        reservedNow = true;
      }

      // RESERVE-DELTA: lines that mapped AFTER the order was first reserved (the listing got
      // imported/mapped, or the SKU fallback newly matched) — reserve just those, so a partially
      // -mapped order doesn't strand stock when its remaining lines resolve on a later pull.
      // Only while still pre-ship; the manual resolveOrderItem path covers the same case.
      if (wasReserved && isPaidOrBeyond && !wasReleased && !wasShipped) {
        const lateItems = lifecycleItems.filter(
          (item) => item.lateResolved && item.productVariantId,
        );
        if (lateItems.length > 0) {
          await prisma.$transaction(async (tx) => {
            const lateVariantIds: string[] = [];
            for (const item of lateItems) {
              if (!item.productVariantId) continue;
              await inventoryServerService.applyOrderReserveTx(tx, {
                organizationId,
                actorUserId,
                variantId: item.productVariantId,
                quantity: item.quantity,
                orderId: saved.id,
              });
              affectedVariantIds.add(item.productVariantId);
              lateVariantIds.push(item.productVariantId);
            }
            await this.snapshotOrderItemCostsTx(tx, saved.id, lateVariantIds);
          });
        }
      }

      // New-order alert: fire once, when this order first becomes reserved (newly PAID).
      // Idempotent across re-pulls via the order-keyed dedupeKey.
      if (!wasReserved && reservedNow) {
        void notificationServerService.emit({
          organizationId,
          actorUserId,
          type: 'ORDER_PLACED',
          title: 'Pesanan baru dibayar',
          body: `Pesanan ${order.externalOrderId} di ${connection.provider} sudah dibayar${order.buyerName ? ` (${order.buyerName})` : ''} — siap diproses.`,
          href: '/dashboard/orders',
          dedupeKey: `order-placed:${saved.id}`,
          entityType: 'order',
          entityId: saved.id,
          data: { provider: connection.provider, externalOrderId: order.externalOrderId },
        });
      }

      if (isShippedStatus && reservedNow && !wasShipped && !wasReleased) {
        // SHIP: consume the reservation (reserved−). Available is unchanged for shipped lines, so
        // they are NOT added to affectedVariantIds. A line CANCELLED within this otherwise-shipped
        // order never left — release it back to available instead of consuming its reservation.
        await prisma.$transaction(async (tx) => {
          for (const item of lifecycleItems) {
            if (!item.productVariantId) continue;
            const lineCancelled =
              lineStatusByKey.get(listingKey(item.externalProductId, item.externalVariantId)) ===
              'CANCELLED';
            if (lineCancelled) {
              await inventoryServerService.applyOrderReleaseTx(tx, {
                organizationId,
                actorUserId,
                variantId: item.productVariantId,
                quantity: item.quantity,
                orderId: saved.id,
              });
              affectedVariantIds.add(item.productVariantId);
            } else {
              await inventoryServerService.applyOrderShipTx(tx, {
                organizationId,
                actorUserId,
                variantId: item.productVariantId,
                quantity: item.quantity,
                orderId: saved.id,
              });
            }
          }
          await tx.order.update({
            where: { id: saved.id },
            data: { inventoryShippedAt: new Date() },
          });
        });
        shipped += 1;

        void notificationServerService.emit({
          organizationId,
          actorUserId,
          type: 'ORDER_SHIPPED',
          title: 'Pesanan dikirim',
          body: `Pesanan ${order.externalOrderId} di ${connection.provider} sudah dikirim${order.noResi ? ` (resi ${order.noResi})` : ''}.`,
          href: '/dashboard/orders',
          dedupeKey: `order-shipped:${saved.id}`,
          entityType: 'order',
          entityId: saved.id,
          data: {
            provider: connection.provider,
            externalOrderId: order.externalOrderId,
            noResi: order.noResi,
          },
        });
      } else if (saved.status === 'CANCELLED' && reservedNow && !wasShipped && !wasReleased) {
        // RELEASE: cancelled before shipping → give the reserved units back.
        await prisma.$transaction(async (tx) => {
          for (const item of lifecycleItems) {
            if (!item.productVariantId) continue;
            await inventoryServerService.applyOrderReleaseTx(tx, {
              organizationId,
              actorUserId,
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
          await returnsServerService.createReturn(organizationId, actorUserId, saved.id, {
            autoDetected: true,
          });
        } catch (error) {
          appLogger.warn('orders.return.autocreate_failed', {
            organizationId,
            orderId: saved.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return { pulled, applied, shipped, reverted, affected: affectedVariantIds, complete };
  }

  /** Best-effort: push each decremented variant's new available stock to its other channels. */
  /**
   * Snapshots each resolved line's COGS — the variant's cost at reserve time —
   * onto the order items, so margin is computed from the cost that applied then.
   * Stamps each line ONCE, at its own reserve time: the `unitCost: null` guard means a
   * line already costed at an earlier reserve is never overwritten — so when two lines of
   * one order map to the same variant but reserve at different times (and the variant's
   * cost changed between), each keeps the cost that applied when IT was reserved.
   */
  private async snapshotOrderItemCostsTx(
    tx: TransactionClient,
    orderId: string,
    variantIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(variantIds)];
    if (uniqueIds.length === 0) return;

    const variants = await tx.productVariant.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, cost: true },
    });

    for (const variant of variants) {
      await tx.orderItem.updateMany({
        where: { orderId, productVariantId: variant.id, unitCost: null },
        data: { unitCost: variant.cost },
      });
    }
  }

  private async propagateAffected(
    organizationId: string,
    actorUserId: string,
    variantIds: Set<string>,
    connectionId: string,
  ): Promise<void> {
    for (const variantId of variantIds) {
      try {
        const inventory = await prisma.inventory.findUnique({
          where: { variantId },
          select: { availableStock: true },
        });
        await enqueuePropagateInventoryStock(
          {
            organizationId,
            actorUserId,
            variantId,
            availableStock: inventory?.availableStock ?? 0,
            eventId: `order-${connectionId}-${variantId}-${Date.now()}`,
            // Don't re-sync the channel the order came from against its own change.
            excludeConnectionId: connectionId,
          },
          { coalesce: true },
        );
      } catch (error) {
        appLogger.warn('orders.propagate.enqueue_failed', {
          organizationId,
          variantId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Gross revenue (Order.totalAmount) per connection for orders FULFILLED in a date range —
   * status SHIPPED/COMPLETED, dated by `inventoryShippedAt` (the once-set fulfillment stamp, so
   * each order counts exactly once in its ship month, no cross-month gap). The base for the
   * finance auto-derived MARKETPLACE_COMMISSION estimate. Read-only.
   */
  async sumRevenueByConnectionForMonth(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<{ connectionId: string; revenue: number }[]> {
    const rows = await prisma.order.groupBy({
      by: ['marketplaceConnectionId'],
      where: {
        organizationId,
        status: { in: ['SHIPPED', 'COMPLETED'] },
        inventoryShippedAt: { gte: from, lte: to },
      },
      _sum: { totalAmount: true },
    });
    return rows.map((row) => ({
      connectionId: row.marketplaceConnectionId,
      revenue: Number(row._sum.totalAmount ?? 0),
    }));
  }
}

export const ordersServerService = new OrdersServerService();
