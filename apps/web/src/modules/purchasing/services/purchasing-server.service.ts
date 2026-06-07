import 'server-only';

import { buildPaginatedResult, prisma, type PaginatedResult } from '@olshop/db';
import { enqueuePropagateInventoryStock } from '@olshop/queue';
import type { Prisma } from '@prisma/client';

import { appLogger } from '@/lib/logger';
import { inventoryServerService } from '@/modules/inventory/services/inventory-server.service';
import { catalogServerService } from '@/modules/catalog/services/catalog-server.service';
import { allocateBundleUnitAmounts } from '@/modules/catalog/utils/bundle-allocation';
import type { BundleResolution } from '@/modules/catalog/types';

import { PurchaseOrderError } from '../errors/purchase-order-errors';
import type { CreatePurchaseOrderInput } from '../validators/create-po';
import type { ReceivePurchaseOrderInput } from '../validators/receive-po';
import type { SearchVariantsQuery } from '../validators/search-variants';
import type {
  PurchaseOrderDetail,
  PurchaseOrderItemDetail,
  PurchaseOrderListItem,
  PurchasableVariant,
  ScannedPurchaseItem,
} from '../types';

const LIST_LIMIT = 100;

const DETAIL_INCLUDE = {
  items: { orderBy: { id: 'asc' } },
} satisfies Prisma.PurchaseOrderInclude;

type PurchaseOrderRow = Prisma.PurchaseOrderGetPayload<{ include: typeof DETAIL_INCLUDE }>;

function mapDetail(row: PurchaseOrderRow): PurchaseOrderDetail {
  const items: PurchaseOrderItemDetail[] = row.items.map((item) => ({
    id: item.id,
    productVariantId: item.productVariantId,
    sku: item.sku,
    name: item.name,
    quantity: item.quantity,
    receivedQuantity: item.receivedQuantity,
    outstanding: Math.max(0, item.quantity - item.receivedQuantity),
    unitCost: item.unitCost.toString(),
    lineTotal: (Number(item.unitCost) * item.quantity).toString(),
    bundleName: item.bundleName,
  }));

  return {
    id: row.id,
    code: row.code,
    supplierName: row.supplierName,
    status: row.status,
    totalCost: row.totalCost.toString(),
    itemCount: row.items.length,
    note: row.note,
    receivedAt: row.receivedAt?.toISOString() ?? null,
    orderedAt: row.orderedAt.toISOString(),
    items,
  };
}

/**
 * Purchase orders (restock from suppliers). Placing a PO marks units as incoming;
 * receiving moves them incoming → available. Stock writes go ONLY through the
 * inventory service; this module reads catalog variants read-only.
 */
export class PurchasingServerService {
  /** Variants for the PO picker — matched by SKU/name, with cost + available/incoming, paginated. */
  async searchVariants(
    userId: string,
    query: SearchVariantsQuery,
  ): Promise<PaginatedResult<PurchasableVariant>> {
    const term = query.q.trim();
    const where: Prisma.ProductVariantWhereInput = {
      userId,
      deletedAt: null,
      isActive: true,
      ...(term
        ? {
            OR: [
              { sku: { contains: term, mode: 'insensitive' } },
              { name: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [variants, total] = await Promise.all([
      prisma.productVariant.findMany({
        where,
        include: {
          inventory: { select: { availableStock: true, incomingStock: true } },
          product: { select: { name: true } },
        },
        orderBy: [{ product: { name: 'asc' } }, { name: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.productVariant.count({ where }),
    ]);

    const items: PurchasableVariant[] = variants.map((variant) => ({
      variantId: variant.id,
      sku: variant.sku,
      name: variant.name,
      productName: variant.product.name,
      variantGroup: variant.variantGroup,
      cost: variant.cost?.toString() ?? null,
      availableStock: variant.inventory?.availableStock ?? 0,
      incomingStock: variant.inventory?.incomingStock ?? 0,
      imageUrl: variant.imageUrl,
    }));

    return buildPaginatedResult(items, total, query.page, query.pageSize);
  }

  /**
   * Resolve a scanned code to a single variant for a PO line (mobile scan-to-order).
   * Matches an (already-normalized) code against barcode then SKU, case-insensitive.
   * Returns null when nothing matches.
   */
  async resolvePurchasableVariant(
    userId: string,
    code: string,
  ): Promise<PurchasableVariant | null> {
    const term = code.trim();
    if (!term) return null;

    const base = { userId, deletedAt: null, isActive: true } as const;
    const include = {
      inventory: { select: { availableStock: true, incomingStock: true } },
      product: { select: { name: true } },
    } satisfies Prisma.ProductVariantInclude;

    const variant =
      (await prisma.productVariant.findFirst({
        where: { ...base, barcode: { equals: term, mode: 'insensitive' } },
        include,
      })) ??
      (await prisma.productVariant.findFirst({
        where: { ...base, sku: { equals: term, mode: 'insensitive' } },
        include,
      }));

    if (!variant) return null;

    return {
      variantId: variant.id,
      sku: variant.sku,
      name: variant.name,
      productName: variant.product.name,
      variantGroup: variant.variantGroup,
      cost: variant.cost?.toString() ?? null,
      availableStock: variant.inventory?.availableStock ?? 0,
      incomingStock: variant.inventory?.incomingStock ?? 0,
      imageUrl: variant.imageUrl,
    };
  }

  async listPurchaseOrders(userId: string): Promise<PurchaseOrderListItem[]> {
    const rows = await prisma.purchaseOrder.findMany({
      where: { userId },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      supplierName: row.supplierName,
      status: row.status,
      totalCost: row.totalCost.toString(),
      itemCount: row._count.items,
      orderedAt: row.orderedAt.toISOString(),
    }));
  }

  async getPurchaseOrder(userId: string, id: string): Promise<PurchaseOrderDetail> {
    const row = await prisma.purchaseOrder.findFirst({
      where: { id, userId },
      include: DETAIL_INCLUDE,
    });
    if (!row) throw PurchaseOrderError.notFound();
    return mapDetail(row);
  }

  /**
   * Place a purchase order (status ORDERED): snapshot the variants, create the PO +
   * lines, and bump each variant's incoming stock — all in one transaction.
   */
  /** Resolve a scanned code to a purchasable variant OR a whole bundle (variant takes priority). */
  async resolveScannedItem(userId: string, code: string): Promise<ScannedPurchaseItem | null> {
    const variant = await this.resolvePurchasableVariant(userId, code);
    if (variant) return { kind: 'variant', variant };
    const bundle = await catalogServerService.resolveBundleByCode(userId, code);
    if (bundle) return { kind: 'bundle', bundle };
    return null;
  }

  async createPurchaseOrder(
    userId: string,
    input: CreatePurchaseOrderInput,
  ): Promise<PurchaseOrderDetail> {
    const variantItems = input.items.filter((item) => item.kind === 'variant');
    const bundleItems = input.items.filter((item) => item.kind === 'bundle');

    const variantIds = [...new Set(variantItems.map((item) => item.variantId))];
    const variants = variantIds.length
      ? await prisma.productVariant.findMany({
          where: { id: { in: variantIds }, userId, deletedAt: null },
          select: { id: true, sku: true, name: true },
        })
      : [];
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    const bundles = await catalogServerService.resolveBundles(
      userId,
      bundleItems.map((item) => item.bundleId),
    );

    for (const item of variantItems) {
      if (!variantById.has(item.variantId))
        throw PurchaseOrderError.validation('A selected product no longer exists.');
    }
    for (const item of bundleItems) {
      const bundle = bundles.get(item.bundleId);
      if (!bundle) throw PurchaseOrderError.validation('A selected bundle no longer exists.');
      if (bundle.components.length === 0)
        throw PurchaseOrderError.validation('A bundle has no components to order.');
    }

    // A bundle PO line explodes into one row per component (stock + cost are per-variant);
    // its single cost is allocated across components (proportional to each component's cost).
    const lines = this.buildPurchaseOrderLines(variantItems, bundleItems, variantById, bundles);
    const totalCost = lines.reduce((sum, line) => sum + Number(line.unitCost) * line.quantity, 0);

    const created = await prisma.$transaction(async (tx) => {
      const count = await tx.purchaseOrder.count({ where: { userId } });
      const code = `PO${(count + 1).toString().padStart(5, '0')}`;

      const order = await tx.purchaseOrder.create({
        data: {
          userId,
          code,
          supplierName: input.supplierName ?? null,
          note: input.note ?? null,
          totalCost,
          items: { create: lines },
        },
      });

      for (const line of lines) {
        await inventoryServerService.adjustIncomingTx(tx, {
          variantId: line.productVariantId,
          delta: line.quantity,
        });
      }

      return order;
    });

    appLogger.info('purchasing.created', {
      userId,
      purchaseOrderId: created.id,
      code: created.code,
    });
    return this.getPurchaseOrder(userId, created.id);
  }

  /** Flatten variant + bundle cart items into per-variant PO rows (bundle cost allocated). */
  private buildPurchaseOrderLines(
    variantItems: Extract<CreatePurchaseOrderInput['items'][number], { kind: 'variant' }>[],
    bundleItems: Extract<CreatePurchaseOrderInput['items'][number], { kind: 'bundle' }>[],
    variantById: Map<string, { id: string; sku: string; name: string }>,
    bundles: Map<string, BundleResolution>,
  ): Prisma.PurchaseOrderItemUncheckedCreateWithoutPurchaseOrderInput[] {
    const lines: Prisma.PurchaseOrderItemUncheckedCreateWithoutPurchaseOrderInput[] = [];

    for (const item of variantItems) {
      const variant = variantById.get(item.variantId)!;
      lines.push({
        productVariantId: item.variantId,
        sku: variant.sku,
        name: variant.name,
        quantity: item.quantity,
        unitCost: item.unitCost,
        bundleName: null,
      });
    }

    for (const item of bundleItems) {
      const bundle = bundles.get(item.bundleId)!;
      const allocated = allocateBundleUnitAmounts(
        Math.round(item.unitCost * 100),
        bundle.components.map((component) => ({
          weightMinor: Math.round(Number(component.cost ?? 0) * 100),
          quantity: component.quantity,
        })),
      );
      bundle.components.forEach((component, index) => {
        lines.push({
          productVariantId: component.productVariantId,
          sku: component.sku,
          name: component.name,
          quantity: item.quantity * component.quantity,
          unitCost: (allocated[index] ?? 0) / 100,
          bundleName: bundle.name,
        });
      });
    }

    return lines;
  }

  /**
   * Receive goods against a PO (partial allowed): per line, move the received qty
   * from incoming to available, then recompute the PO status. Restocked variants
   * propagate to the channels afterwards.
   */
  async receivePurchaseOrder(
    userId: string,
    id: string,
    input: ReceivePurchaseOrderInput,
  ): Promise<PurchaseOrderDetail> {
    const order = await prisma.purchaseOrder.findFirst({
      where: { id, userId },
      include: { items: true },
    });
    if (!order) throw PurchaseOrderError.notFound();
    if (order.status !== 'ORDERED' && order.status !== 'PARTIALLY_RECEIVED') {
      throw PurchaseOrderError.validation('This purchase order can no longer be received.');
    }

    const itemsById = new Map(order.items.map((item) => [item.id, item]));
    // Clamp each line's received qty to what is still outstanding.
    const receipts = new Map<string, number>();
    for (const line of input.lines) {
      const item = itemsById.get(line.purchaseOrderItemId);
      if (!item) throw PurchaseOrderError.validation('Unknown purchase-order item.');
      const outstanding = Math.max(0, item.quantity - item.receivedQuantity);
      const qty = Math.min(line.quantity, outstanding);
      if (qty > 0) receipts.set(item.id, qty);
    }
    if (receipts.size === 0) {
      throw PurchaseOrderError.validation('Nothing left to receive on this purchase order.');
    }

    const affected = new Set<string>();

    await prisma.$transaction(async (tx) => {
      for (const [itemId, qty] of receipts) {
        const item = itemsById.get(itemId)!;
        await tx.purchaseOrderItem.update({
          where: { id: itemId },
          data: { receivedQuantity: { increment: qty } },
        });
        await inventoryServerService.applyPurchaseReceiveTx(tx, {
          userId,
          variantId: item.productVariantId,
          quantity: qty,
          purchaseOrderId: id,
          unitCost: Number(item.unitCost),
        });
        affected.add(item.productVariantId);
      }

      const fullyReceived = order.items.every((item) => {
        const received = item.receivedQuantity + (receipts.get(item.id) ?? 0);
        return received >= item.quantity;
      });

      await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
          receivedAt: fullyReceived ? new Date() : null,
        },
      });
    });

    appLogger.info('purchasing.received', { userId, purchaseOrderId: id, lines: receipts.size });
    await this.propagateAffected(userId, [...affected]);
    return this.getPurchaseOrder(userId, id);
  }

  /** Cancel a not-yet-received PO: remove the outstanding incoming stock. */
  async cancelPurchaseOrder(userId: string, id: string): Promise<PurchaseOrderDetail> {
    const order = await prisma.purchaseOrder.findFirst({
      where: { id, userId },
      include: { items: true },
    });
    if (!order) throw PurchaseOrderError.notFound();
    if (order.status === 'RECEIVED' || order.status === 'CANCELLED') {
      throw PurchaseOrderError.validation('This purchase order can no longer be cancelled.');
    }

    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const outstanding = Math.max(0, item.quantity - item.receivedQuantity);
        if (outstanding > 0) {
          await inventoryServerService.adjustIncomingTx(tx, {
            variantId: item.productVariantId,
            delta: -outstanding,
          });
        }
      }
      await tx.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
    });

    appLogger.info('purchasing.cancelled', { userId, purchaseOrderId: id });
    return this.getPurchaseOrder(userId, id);
  }

  /** Best-effort: push each received variant's new available stock to all channels. */
  private async propagateAffected(userId: string, variantIds: string[]): Promise<void> {
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
          eventId: `purchase-${variantId}-${Date.now()}`,
        });
      } catch (error) {
        appLogger.warn('purchasing.propagate.enqueue_failed', {
          userId,
          variantId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

export const purchasingServerService = new PurchasingServerService();
