import 'server-only';

import { buildPaginatedResult, notDeleted, prisma, type PaginatedResult } from '@olshop/db';
import { Prisma, type Inventory, type Product, type ProductVariant } from '@prisma/client';

import { appLogger } from '@/lib/logger';
import { inventoryServerService } from '@/modules/inventory/services/inventory-server.service';

import { CatalogError } from '../errors/catalog-errors';
import type { ProductDetail, ProductListItem, ProductVariantItem } from '../types';
import type { CreateProductInput, CreateVariantInput } from '../validators/create-product';
import type { ListProductsQuery } from '../validators/list-products';
import type { UpdateProductInput } from '../validators/update-product';
import type { UpdateVariantInput } from '../validators/update-variant';

type VariantWithInventory = ProductVariant & { inventory: Inventory | null };
type ProductWithVariants = Product & { variants: VariantWithInventory[] };

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function isLowStock(variant: ProductVariant, availableStock: number): boolean {
  return variant.alertEnabled && availableStock <= variant.lowStockThreshold;
}

function mapVariant(variant: VariantWithInventory): ProductVariantItem {
  const availableStock = variant.inventory?.availableStock ?? 0;

  return {
    id: variant.id,
    productId: variant.productId,
    sku: variant.sku,
    name: variant.name,
    barcode: variant.barcode,
    price: variant.price.toString(),
    cost: variant.cost?.toString() ?? null,
    weight: variant.weight?.toString() ?? null,
    isActive: variant.isActive,
    lowStockThreshold: variant.lowStockThreshold,
    alertEnabled: variant.alertEnabled,
    leadTimeDays: variant.leadTimeDays,
    minOrderQty: variant.minOrderQty,
    availableStock,
    isLowStock: isLowStock(variant, availableStock),
    createdAt: variant.createdAt.toISOString(),
    updatedAt: variant.updatedAt.toISOString(),
  };
}

/** Planning fields use 0 to mean "unset"; persist that as null. */
function normalizePlanningValue(value: number | undefined): number | null {
  return value && value > 0 ? value : null;
}

function mapProductDetail(product: ProductWithVariants): ProductDetail {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    isActive: product.isActive,
    variants: product.variants.map(mapVariant),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function buildVariantData(
  userId: string,
  productId: string,
  input: CreateVariantInput,
): Prisma.ProductVariantUncheckedCreateInput {
  return {
    userId,
    productId,
    sku: input.sku,
    name: input.name,
    barcode: input.barcode ?? null,
    price: input.price,
    cost: input.cost ?? null,
    weight: input.weight ?? null,
    lowStockThreshold: input.lowStockThreshold,
    alertEnabled: input.alertEnabled,
    leadTimeDays: normalizePlanningValue(input.leadTimeDays),
    minOrderQty: normalizePlanningValue(input.minOrderQty),
  };
}

/**
 * Owns the catalog master (`Product` / `ProductVariant`). Stock lives in the
 * inventory module — this service reaches it only through `inventoryServerService`,
 * never by writing the inventory tables directly.
 */
export class CatalogServerService {
  async listProducts(
    userId: string,
    query: ListProductsQuery,
  ): Promise<PaginatedResult<ProductListItem>> {
    const where: Prisma.ProductWhereInput = {
      userId,
      ...notDeleted,
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          variants: {
            where: notDeleted,
            select: { inventory: { select: { availableStock: true } } },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    const items: ProductListItem[] = products.map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      isActive: product.isActive,
      variantCount: product.variants.length,
      totalAvailableStock: product.variants.reduce(
        (sum, variant) => sum + (variant.inventory?.availableStock ?? 0),
        0,
      ),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    }));

    return buildPaginatedResult(items, total, query.page, query.pageSize);
  }

  async getProductById(userId: string, productId: string): Promise<ProductDetail> {
    const product = await prisma.product.findFirst({
      where: { id: productId, userId, ...notDeleted },
      include: {
        variants: {
          where: notDeleted,
          orderBy: { createdAt: 'asc' },
          include: { inventory: true },
        },
      },
    });

    if (!product) throw CatalogError.notFound();

    return mapProductDetail(product);
  }

  async createProduct(userId: string, input: CreateProductInput): Promise<ProductDetail> {
    await this.assertSkuAvailable(userId, input.variant.sku);

    let productId: string;
    let variantId: string;

    try {
      const created = await prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            userId,
            name: input.name,
            description: input.description ?? null,
            category: input.category ?? null,
          },
        });

        const variant = await tx.productVariant.create({
          data: buildVariantData(userId, product.id, input.variant),
        });

        return { productId: product.id, variantId: variant.id };
      });

      productId = created.productId;
      variantId = created.variantId;
    } catch (error) {
      if (isUniqueConstraintError(error)) throw CatalogError.duplicateSku(input.variant.sku);
      throw error;
    }

    await this.initializeVariantStock(userId, variantId, input.variant.initialStock);

    appLogger.info('catalog.product.created', { userId, productId, variantId });

    return this.getProductById(userId, productId);
  }

  async addVariant(
    userId: string,
    productId: string,
    input: CreateVariantInput,
  ): Promise<ProductVariantItem> {
    await this.assertProductOwned(userId, productId);
    await this.assertSkuAvailable(userId, input.sku);

    let variantId: string;
    try {
      const variant = await prisma.productVariant.create({
        data: buildVariantData(userId, productId, input),
        select: { id: true },
      });
      variantId = variant.id;
    } catch (error) {
      if (isUniqueConstraintError(error)) throw CatalogError.duplicateSku(input.sku);
      throw error;
    }

    await this.initializeVariantStock(userId, variantId, input.initialStock);

    appLogger.info('catalog.variant.created', { userId, productId, variantId });

    const created = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
      include: { inventory: true },
    });

    return mapVariant(created);
  }

  /**
   * Update a single variant's planning fields (low-stock threshold, alert,
   * reorder lead time / MOQ). Lead time and MOQ use 0 to mean "unset" → null.
   */
  async updateVariant(
    userId: string,
    productId: string,
    variantId: string,
    input: UpdateVariantInput,
  ): Promise<ProductVariantItem> {
    await this.assertProductOwned(userId, productId);

    const owned = await prisma.productVariant.findFirst({
      where: { id: variantId, productId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!owned) throw CatalogError.notFound('Variant not found.');

    await prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...(input.lowStockThreshold !== undefined
          ? { lowStockThreshold: input.lowStockThreshold }
          : {}),
        ...(input.alertEnabled !== undefined ? { alertEnabled: input.alertEnabled } : {}),
        ...(input.leadTimeDays !== undefined
          ? { leadTimeDays: normalizePlanningValue(input.leadTimeDays) }
          : {}),
        ...(input.minOrderQty !== undefined
          ? { minOrderQty: normalizePlanningValue(input.minOrderQty) }
          : {}),
      },
    });

    appLogger.info('catalog.variant.updated', { userId, productId, variantId });

    const updated = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
      include: { inventory: true },
    });

    return mapVariant(updated);
  }

  async updateProduct(
    userId: string,
    productId: string,
    input: UpdateProductInput,
  ): Promise<ProductDetail> {
    await this.assertProductOwned(userId, productId);

    await prisma.product.update({
      where: { id: productId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    appLogger.info('catalog.product.updated', { userId, productId });

    return this.getProductById(userId, productId);
  }

  async deleteProduct(userId: string, productId: string): Promise<void> {
    await this.assertProductOwned(userId, productId);

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.productVariant.updateMany({
        where: { productId, deletedAt: null },
        data: { deletedAt: now },
      });
      await tx.product.update({ where: { id: productId }, data: { deletedAt: now } });
    });

    appLogger.info('catalog.product.deleted', { userId, productId });
  }

  private async initializeVariantStock(
    userId: string,
    variantId: string,
    initialStock: number,
  ): Promise<void> {
    await inventoryServerService.ensureInventory(variantId);

    if (initialStock > 0) {
      await inventoryServerService.adjustStock(userId, variantId, {
        delta: initialStock,
        reason: 'RESTOCK',
        note: 'Initial stock',
      });
    }
  }

  private async assertProductOwned(userId: string, productId: string): Promise<void> {
    const product = await prisma.product.findFirst({
      where: { id: productId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw CatalogError.notFound();
  }

  private async assertSkuAvailable(userId: string, sku: string): Promise<void> {
    const existing = await prisma.productVariant.findFirst({
      where: { userId, sku, deletedAt: null },
      select: { id: true },
    });
    if (existing) throw CatalogError.duplicateSku(sku);
  }
}

export const catalogServerService = new CatalogServerService();
