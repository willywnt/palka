import 'server-only';

import { prisma } from '@olshop/db';
import { enqueuePropagateInventoryStock } from '@olshop/queue';
import type { Prisma } from '@prisma/client';

import { appLogger } from '@/lib/logger';
import { inventoryServerService } from '@/modules/inventory/services/inventory-server.service';
import { catalogServerService } from '@/modules/catalog/services/catalog-server.service';
import { allocateBundleUnitAmounts } from '@/modules/catalog/utils/bundle-allocation';

import type { BundleResolution } from '@/modules/catalog/types';

import { SaleError } from '../errors/sale-errors';
import type { CreateSaleInput } from '../validators/create-sale';
import type {
  SaleDetail,
  SaleItemDetail,
  SaleListItem,
  ScannedSaleItem,
  SellableVariant,
} from '../types';

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
    bundleName: item.bundleName,
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

    return variants.map((variant) => ({
      variantId: variant.id,
      sku: variant.sku,
      name: variant.name,
      productName: variant.product.name,
      price: variant.price.toString(),
      availableStock: variant.inventory?.availableStock ?? 0,
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

    return {
      variantId: variant.id,
      sku: variant.sku,
      name: variant.name,
      productName: variant.product.name,
      price: variant.price.toString(),
      availableStock: variant.inventory?.availableStock ?? 0,
      imageUrl: variant.imageUrl,
    };
  }

  /** Resolve a scanned code to a sellable variant OR a whole bundle (variant takes priority). */
  async resolveScannedItem(userId: string, code: string): Promise<ScannedSaleItem | null> {
    const variant = await this.resolveSellableVariant(userId, code);
    if (variant) return { kind: 'variant', variant };
    const bundle = await catalogServerService.resolveBundleByCode(userId, code);
    if (bundle) return { kind: 'bundle', bundle };
    return null;
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

    await prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        await inventoryServerService.applyOfflineSaleReversalTx(tx, {
          userId,
          variantId: item.productVariantId,
          quantity: item.quantity,
          saleId: sale.id,
        });
      }
      await tx.sale.update({ where: { id: sale.id }, data: { status: 'VOID' } });
    });

    appLogger.info('sales.voided', { userId, saleId: sale.id, code: sale.code });

    await this.propagateAffected(userId, [
      ...new Set(sale.items.map((item) => item.productVariantId)),
    ]);
    return this.getSale(userId, saleId);
  }

  /**
   * Ring up an offline sale: snapshot the variants, create the sale + lines, and
   * decrement each variant's available stock in ONE transaction (oversell allowed —
   * the goods are in hand). Propagates the new available to marketplaces afterwards.
   */
  async createSale(userId: string, input: CreateSaleInput): Promise<SaleDetail> {
    const variantItems = input.items.filter((item) => item.kind === 'variant');
    const bundleItems = input.items.filter((item) => item.kind === 'bundle');

    const variantIds = [...new Set(variantItems.map((item) => item.variantId))];
    const variants = variantIds.length
      ? await prisma.productVariant.findMany({
          where: { id: { in: variantIds }, userId, deletedAt: null },
          select: { id: true, sku: true, name: true, cost: true },
        })
      : [];
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    const bundles = await catalogServerService.resolveBundles(
      userId,
      bundleItems.map((item) => item.bundleId),
    );

    for (const item of variantItems) {
      if (!variantById.has(item.variantId))
        throw SaleError.validation('A selected product no longer exists.');
    }
    for (const item of bundleItems) {
      const bundle = bundles.get(item.bundleId);
      if (!bundle) throw SaleError.validation('A selected bundle no longer exists.');
      if (bundle.components.length === 0)
        throw SaleError.validation('A bundle has no components to sell.');
    }

    // A bundle explodes into one sale line per component (stock + accounting are per-variant);
    // its single price is allocated across components so per-variant revenue stays correct.
    const lines = this.buildSaleLines(variantItems, bundleItems, variantById, bundles);
    const totalAmount = lines.reduce(
      (sum, line) => sum + Number(line.unitPrice) * line.quantity,
      0,
    );

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
          items: { create: lines },
        },
      });

      for (const line of lines) {
        await inventoryServerService.applyOfflineSaleTx(tx, {
          userId,
          variantId: line.productVariantId,
          quantity: line.quantity,
          saleId: sale.id,
        });
      }

      return sale;
    });

    appLogger.info('sales.created', {
      userId,
      saleId: created.id,
      code: created.code,
      items: lines.length,
    });

    await this.propagateAffected(userId, [...new Set(lines.map((line) => line.productVariantId))]);
    return this.getSale(userId, created.id);
  }

  /** Flatten variant + bundle cart items into per-variant SaleItem rows (bundle price allocated). */
  private buildSaleLines(
    variantItems: Extract<CreateSaleInput['items'][number], { kind: 'variant' }>[],
    bundleItems: Extract<CreateSaleInput['items'][number], { kind: 'bundle' }>[],
    variantById: Map<
      string,
      { id: string; sku: string; name: string; cost: Prisma.Decimal | null }
    >,
    bundles: Map<string, BundleResolution>,
  ): Prisma.SaleItemUncheckedCreateWithoutSaleInput[] {
    const lines: Prisma.SaleItemUncheckedCreateWithoutSaleInput[] = [];

    for (const item of variantItems) {
      const variant = variantById.get(item.variantId)!;
      lines.push({
        productVariantId: item.variantId,
        sku: variant.sku,
        name: variant.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitCost: variant.cost,
        bundleName: null,
      });
    }

    for (const item of bundleItems) {
      const bundle = bundles.get(item.bundleId)!;
      const allocated = allocateBundleUnitAmounts(
        Math.round(item.unitPrice * 100),
        bundle.components.map((component) => ({
          weightMinor: Math.round(Number(component.price) * 100),
          quantity: component.quantity,
        })),
      );
      bundle.components.forEach((component, index) => {
        lines.push({
          productVariantId: component.productVariantId,
          sku: component.sku,
          name: component.name,
          quantity: item.quantity * component.quantity,
          unitPrice: (allocated[index] ?? 0) / 100,
          unitCost: component.cost,
          bundleName: bundle.name,
        });
      });
    }

    return lines;
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
