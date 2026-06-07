import 'server-only';

import { prisma } from '@olshop/db';
import { enqueuePropagateInventoryStock } from '@olshop/queue';
import type { Prisma } from '@prisma/client';

import { appLogger } from '@/lib/logger';
import { catalogServerService } from '@/modules/catalog/services/catalog-server.service';
import { inventoryServerService } from '@/modules/inventory/services/inventory-server.service';

import { SaleError } from '../errors/sale-errors';
import type { CreateSaleInput } from '../validators/create-sale';
import type { SaleDetail, SaleItemDetail, SaleListItem, SellableVariant } from '../types';

const SEARCH_LIMIT = 20;
const LIST_LIMIT = 100;

const DETAIL_INCLUDE = {
  items: {
    orderBy: { id: 'asc' },
    include: { productVariant: { select: { imageUrl: true } } },
  },
} satisfies Prisma.SaleInclude;

type SaleRow = Prisma.SaleGetPayload<{ include: typeof DETAIL_INCLUDE }>;

function mapDetail(row: SaleRow): SaleDetail {
  const items: SaleItemDetail[] = row.items.map((item) => ({
    id: item.id,
    productVariantId: item.productVariantId,
    sku: item.sku,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice.toString(),
    lineTotal: (Number(item.unitPrice) * item.quantity).toString(),
    imageUrl: item.productVariant?.imageUrl ?? null,
  }));

  return {
    id: row.id,
    code: row.code,
    customerName: row.customerName,
    paymentMethod: row.paymentMethod,
    status: row.status,
    totalAmount: row.totalAmount.toString(),
    itemCount: row.items.length,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    items,
  };
}

/**
 * Offline (POS) sales. A sale immediately decrements the internal SoT (the same
 * truth the marketplaces sync from) and propagates to the other channels, so
 * selling at the counter can't oversell online. Stock writes go ONLY through the
 * inventory service; this module reads catalog variants read-only.
 */
export class SalesServerService {
  /** Active variants for the POS picker — matched by SKU/name, with price + stock. */
  async searchSellableVariants(userId: string, q: string): Promise<SellableVariant[]> {
    const term = q.trim();
    const variants = await prisma.productVariant.findMany({
      where: {
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
      },
      include: {
        inventory: { select: { availableStock: true } },
        product: { select: { name: true } },
      },
      orderBy: [{ product: { name: 'asc' } }, { name: 'asc' }],
      take: SEARCH_LIMIT,
    });

    const bundles = await catalogServerService.resolveBundles(
      userId,
      variants.map((variant) => variant.id),
    );

    return variants.map((variant) => ({
      variantId: variant.id,
      sku: variant.sku,
      name: variant.name,
      productName: variant.product.name,
      price: variant.price.toString(),
      // A bundle shows how many it can build from components, not its own stock.
      availableStock: bundles.get(variant.id)?.buildable ?? variant.inventory?.availableStock ?? 0,
      isBundle: bundles.has(variant.id),
      imageUrl: variant.imageUrl,
    }));
  }

  /**
   * Resolve a scanned code to a single sellable variant for the POS cart (mobile
   * scan-to-cart). A printed label encodes `barcode ?? sku`, and the scan arrives
   * already normalized (uppercased, spaces stripped) — so match case-insensitively
   * and prefer a barcode hit over a SKU hit. Returns null when nothing matches.
   */
  async resolveSellableVariant(userId: string, code: string): Promise<SellableVariant | null> {
    const term = code.trim();
    if (!term) return null;

    const base = { userId, deletedAt: null, isActive: true } as const;
    const include = {
      inventory: { select: { availableStock: true } },
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

    const bundle = (await catalogServerService.resolveBundles(userId, [variant.id])).get(
      variant.id,
    );

    return {
      variantId: variant.id,
      sku: variant.sku,
      name: variant.name,
      productName: variant.product.name,
      price: variant.price.toString(),
      availableStock: bundle?.buildable ?? variant.inventory?.availableStock ?? 0,
      isBundle: Boolean(bundle),
      imageUrl: variant.imageUrl,
    };
  }

  async listSales(userId: string): Promise<SaleListItem[]> {
    const rows = await prisma.sale.findMany({
      where: { userId },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      customerName: row.customerName,
      paymentMethod: row.paymentMethod,
      status: row.status,
      totalAmount: row.totalAmount.toString(),
      itemCount: row._count.items,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getSale(userId: string, saleId: string): Promise<SaleDetail> {
    const row = await prisma.sale.findFirst({
      where: { id: saleId, userId },
      include: DETAIL_INCLUDE,
    });
    if (!row) throw SaleError.notFound();
    return mapDetail(row);
  }

  /**
   * Voids a completed counter sale: restock every line (available+) and mark the
   * sale VOID in one transaction, then propagate. Idempotent — an already-VOID sale
   * is returned unchanged. Voided sales drop out of the profit report (which counts
   * only COMPLETED sales).
   */
  async voidSale(userId: string, saleId: string): Promise<SaleDetail> {
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, userId },
      include: { items: { select: { productVariantId: true, quantity: true } } },
    });
    if (!sale) throw SaleError.notFound();
    if (sale.status === 'VOID') return this.getSale(userId, saleId);

    const variantIds = [...new Set(sale.items.map((item) => item.productVariantId))];
    // Mirror the sale: a bundle decremented its components, so the void restocks
    // those components (using the current composition), not the bundle itself.
    const bundles = await catalogServerService.resolveBundles(userId, variantIds);

    await prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        const bundle = bundles.get(item.productVariantId);
        if (bundle) {
          for (const component of bundle.components) {
            await inventoryServerService.applyOfflineSaleReversalTx(tx, {
              userId,
              variantId: component.componentVariantId,
              quantity: item.quantity * component.quantity,
              saleId: sale.id,
            });
          }
        } else {
          await inventoryServerService.applyOfflineSaleReversalTx(tx, {
            userId,
            variantId: item.productVariantId,
            quantity: item.quantity,
            saleId: sale.id,
          });
        }
      }
      await tx.sale.update({ where: { id: sale.id }, data: { status: 'VOID' } });
    });

    appLogger.info('sales.voided', { userId, saleId: sale.id, code: sale.code });

    const affectedVariantIds = new Set<string>();
    for (const item of sale.items) {
      const bundle = bundles.get(item.productVariantId);
      if (bundle) {
        bundle.components.forEach((component) =>
          affectedVariantIds.add(component.componentVariantId),
        );
      } else {
        affectedVariantIds.add(item.productVariantId);
      }
    }
    await this.propagateAffected(userId, [...affectedVariantIds]);
    return this.getSale(userId, saleId);
  }

  /**
   * Ring up an offline sale: snapshot the variants, create the sale + lines, and
   * decrement each variant's available stock in ONE transaction (oversell allowed —
   * the goods are in hand). Propagates the new available to marketplaces afterwards.
   */
  async createSale(userId: string, input: CreateSaleInput): Promise<SaleDetail> {
    const variantIds = [...new Set(input.items.map((item) => item.variantId))];
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds }, userId, deletedAt: null },
      select: { id: true, sku: true, name: true, cost: true },
    });
    const byId = new Map(variants.map((variant) => [variant.id, variant]));

    for (const item of input.items) {
      if (!byId.has(item.variantId))
        throw SaleError.validation('A selected product no longer exists.');
    }

    const totalAmount = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    // Bundles decrement their component variants (not their own stock) on sale.
    const bundles = await catalogServerService.resolveBundles(userId, variantIds);

    const created = await prisma.$transaction(async (tx) => {
      const count = await tx.sale.count({ where: { userId } });
      const code = `S${(count + 1).toString().padStart(5, '0')}`;

      const sale = await tx.sale.create({
        data: {
          userId,
          code,
          customerName: input.customerName ?? null,
          paymentMethod: input.paymentMethod,
          totalAmount,
          note: input.note ?? null,
          items: {
            create: input.items.map((item) => {
              const variant = byId.get(item.variantId)!;
              return {
                productVariantId: item.variantId,
                sku: variant.sku,
                name: variant.name,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                // COGS snapshot: the variant's cost at sale time (null = unknown).
                unitCost: variant.cost,
              };
            }),
          },
        },
      });

      for (const item of input.items) {
        const bundle = bundles.get(item.variantId);
        if (bundle) {
          for (const component of bundle.components) {
            await inventoryServerService.applyOfflineSaleTx(tx, {
              userId,
              variantId: component.componentVariantId,
              quantity: item.quantity * component.quantity,
              saleId: sale.id,
            });
          }
        } else {
          await inventoryServerService.applyOfflineSaleTx(tx, {
            userId,
            variantId: item.variantId,
            quantity: item.quantity,
            saleId: sale.id,
          });
        }
      }

      return sale;
    });

    appLogger.info('sales.created', {
      userId,
      saleId: created.id,
      code: created.code,
      items: input.items.length,
    });

    // Propagate the variants whose available actually changed — a bundle's components,
    // not the bundle itself.
    const affectedVariantIds = new Set<string>();
    for (const item of input.items) {
      const bundle = bundles.get(item.variantId);
      if (bundle) {
        bundle.components.forEach((component) =>
          affectedVariantIds.add(component.componentVariantId),
        );
      } else {
        affectedVariantIds.add(item.variantId);
      }
    }
    await this.propagateAffected(userId, [...affectedVariantIds]);
    return this.getSale(userId, created.id);
  }

  /** Best-effort: push each sold variant's new available stock to all sync-ready channels. */
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
          eventId: `sale-${variantId}-${Date.now()}`,
        });
      } catch (error) {
        appLogger.warn('sales.propagate.enqueue_failed', {
          userId,
          variantId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

export const salesServerService = new SalesServerService();
