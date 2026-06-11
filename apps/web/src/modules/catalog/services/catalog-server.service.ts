import 'server-only';

import { buildPaginatedResult, notDeleted, prisma, type PaginatedResult } from '@falka/db';
import { Prisma, type Inventory, type Product, type ProductVariant } from '@prisma/client';

import { appLogger } from '@/lib/logger';
import { inventoryServerService } from '@/modules/inventory/services/inventory-server.service';
import { marketplaceMappingService } from '@/modules/marketplace/services/marketplace-mapping.service';
import { returnsServerService } from '@/modules/returns/services/returns-server.service';
import { storageService } from '@/modules/storage/services/storage.service';

import { CatalogError } from '../errors/catalog-errors';
import type {
  BundleComponentLine,
  BundleDetail,
  BundleLabel,
  BundleListItem,
  BundleListSummary,
  BundleResolution,
  DeletionBlockers,
  LabelVariant,
  ProductDetail,
  ProductListItem,
  ProductVariantItem,
  VariantMappingRef,
} from '../types';
import { computeBuildableQty } from '../utils/bundle';
import { archivedSku } from '../utils/variants';
import type { CreateBundleInput, ListBundlesQuery, UpdateBundleInput } from '../validators/bundle';
import type { CreateProductInput } from '../validators/create-product';
import type { LabelVariantsQuery } from '../validators/label-variants';
import type { ListProductsQuery } from '../validators/list-products';
import type { UpdateProductInput } from '../validators/update-product';
import type { UpdateVariantInput } from '../validators/update-variant';
import type { CreateVariantInput } from '../validators/variant';
import type { SetVariantImageInput } from '../validators/variant-image';

type VariantWithInventory = ProductVariant & { inventory: Inventory | null };
type ProductWithVariants = Product & { variants: VariantWithInventory[] };

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function quoteNames(names: string[]): string {
  return names.map((name) => `“${name}”`).join(', ');
}

type InventoryStockField = 'reservedStock' | 'incomingStock' | 'availableStock' | 'damagedStock';

function sumInventory(
  variants: { inventory: Record<InventoryStockField, number> | null }[],
  field: InventoryStockField,
): number {
  return variants.reduce((total, variant) => total + (variant.inventory?.[field] ?? 0), 0);
}

function isLowStock(variant: ProductVariant, availableStock: number): boolean {
  return variant.alertEnabled && availableStock <= variant.lowStockThreshold;
}

function mapVariant(
  variant: VariantWithInventory,
  mappings: VariantMappingRef[] = [],
): ProductVariantItem {
  const availableStock = variant.inventory?.availableStock ?? 0;

  return {
    id: variant.id,
    productId: variant.productId,
    sku: variant.sku,
    name: variant.name,
    variantGroup: variant.variantGroup,
    imageUrl: variant.imageUrl,
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
    reservedStock: variant.inventory?.reservedStock ?? 0,
    incomingStock: variant.inventory?.incomingStock ?? 0,
    isLowStock: isLowStock(variant, availableStock),
    labelPrintedAt: variant.labelPrintedAt?.toISOString() ?? null,
    mappings,
    createdAt: variant.createdAt.toISOString(),
    updatedAt: variant.updatedAt.toISOString(),
  };
}

/** Planning fields use 0 to mean "unset"; persist that as null. */
function normalizePlanningValue(value: number | undefined): number | null {
  return value && value > 0 ? value : null;
}

function mapProductDetail(
  product: ProductWithVariants,
  mappingsByVariant: Map<string, VariantMappingRef[]>,
): ProductDetail {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    isActive: product.isActive,
    variants: product.variants.map((variant) =>
      mapVariant(variant, mappingsByVariant.get(variant.id) ?? []),
    ),
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
    variantGroup: input.variantGroup ?? null,
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

/** Shared shape for reading a bundle with its component lines (+ each variant's stock/value). */
const bundleDetailInclude = {
  items: {
    orderBy: { productVariant: { name: 'asc' } },
    select: {
      quantity: true,
      productVariant: {
        select: {
          id: true,
          sku: true,
          name: true,
          price: true,
          cost: true,
          deletedAt: true,
          inventory: { select: { availableStock: true } },
        },
      },
    },
  },
} satisfies Prisma.BundleInclude;

type BundleWithItems = Prisma.BundleGetPayload<{ include: typeof bundleDetailInclude }>;

/** Map a loaded bundle's items to component lines (a soft-deleted component reads as 0 stock). */
function toBundleComponentLines(bundle: BundleWithItems): BundleComponentLine[] {
  return bundle.items.map((item) => ({
    productVariantId: item.productVariant.id,
    sku: item.productVariant.sku,
    name: item.productVariant.name,
    quantity: item.quantity,
    availableStock: item.productVariant.deletedAt
      ? 0
      : (item.productVariant.inventory?.availableStock ?? 0),
    price: item.productVariant.price.toString(),
    cost: item.productVariant.cost?.toString() ?? null,
  }));
}

/**
 * Owns the catalog master (`Product` / `ProductVariant`). Stock lives in the
 * inventory module — this service reaches it only through `inventoryServerService`,
 * never by writing the inventory tables directly.
 */
export class CatalogServerService {
  /**
   * Active variants for the label studio — matched by SKU/barcode/name, flat
   * across products, paginated. Already-printed variants sort to the end so the
   * next not-yet-printed ones surface first.
   */
  async listLabelVariants(
    userId: string,
    query: LabelVariantsQuery,
  ): Promise<PaginatedResult<LabelVariant>> {
    const term = query.q.trim();
    const where: Prisma.ProductVariantWhereInput = {
      userId,
      deletedAt: null,
      isActive: true,
      ...(term
        ? {
            OR: [
              { sku: { contains: term, mode: 'insensitive' } },
              { barcode: { contains: term, mode: 'insensitive' } },
              { name: { contains: term, mode: 'insensitive' } },
              { product: { name: { contains: term, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [variants, total] = await Promise.all([
      prisma.productVariant.findMany({
        where,
        include: { product: { select: { name: true } } },
        // Not-yet-printed (null) first; printed ones sink to the end.
        orderBy: [
          { labelPrintedAt: { sort: 'asc', nulls: 'first' } },
          { product: { name: 'asc' } },
          { name: 'asc' },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.productVariant.count({ where }),
    ]);

    const items: LabelVariant[] = variants.map((variant) => ({
      variantId: variant.id,
      productName: variant.product.name,
      name: variant.name,
      variantGroup: variant.variantGroup,
      sku: variant.sku,
      barcode: variant.barcode,
      price: variant.price.toString(),
      imageUrl: variant.imageUrl,
      labelPrintedAt: variant.labelPrintedAt?.toISOString() ?? null,
    }));

    return buildPaginatedResult(items, total, query.page, query.pageSize);
  }

  /** Stamp the label-printed time for the given variants (re-printing is allowed). */
  async markLabelsPrinted(userId: string, variantIds: string[]): Promise<void> {
    const ids = [...new Set(variantIds)];
    if (ids.length === 0) return;

    const result = await prisma.productVariant.updateMany({
      where: { id: { in: ids }, userId, deletedAt: null },
      data: { labelPrintedAt: new Date() },
    });

    appLogger.info('catalog.labels.printed', {
      userId,
      requested: ids.length,
      updated: result.count,
    });
  }

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

    const mappingsByVariant = await marketplaceMappingService.getVariantMappings(
      userId,
      product.variants.map((variant) => variant.id),
    );

    return mapProductDetail(product, mappingsByVariant);
  }

  async createProduct(userId: string, input: CreateProductInput): Promise<ProductDetail> {
    await this.assertSkusAvailable(
      userId,
      input.variants.map((variant) => variant.sku),
    );

    let productId: string;
    let variantIds: string[];
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
        const ids = await this.createVariantLeaves(tx, userId, product.id, input.variants);
        return { productId: product.id, variantIds: ids };
      });
      productId = created.productId;
      variantIds = created.variantIds;
    } catch (error) {
      if (isUniqueConstraintError(error))
        throw CatalogError.duplicateSku(input.variants[0]?.sku ?? '');
      throw error;
    }

    await this.initVariantStocks(userId, variantIds, input.variants);

    appLogger.info('catalog.product.created', { userId, productId, variants: variantIds.length });

    return this.getProductById(userId, productId);
  }

  /**
   * Add one or more leaf variants to a product in one go — a standalone variant
   * (single input) or a grouped variant (one input per subvariant, all sharing a
   * `variantGroup`). Rows are created in a transaction; stock is then initialized
   * per leaf. SKUs must be unique within the batch and across the account.
   */
  async addVariants(
    userId: string,
    productId: string,
    inputs: CreateVariantInput[],
  ): Promise<ProductVariantItem[]> {
    await this.assertProductOwned(userId, productId);
    await this.assertSkusAvailable(
      userId,
      inputs.map((input) => input.sku),
    );

    let variantIds: string[];
    try {
      variantIds = await prisma.$transaction((tx) =>
        this.createVariantLeaves(tx, userId, productId, inputs),
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) throw CatalogError.duplicateSku(inputs[0]?.sku ?? '');
      throw error;
    }

    await this.initVariantStocks(userId, variantIds, inputs);

    appLogger.info('catalog.variants.created', { userId, productId, count: variantIds.length });

    const created = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { inventory: true },
    });
    const byId = new Map(created.map((variant) => [variant.id, variant]));

    return variantIds
      .map((id) => byId.get(id))
      .filter((variant): variant is VariantWithInventory => variant !== undefined)
      .map((variant) => mapVariant(variant));
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

  /** Set/replace a variant's photo from a just-uploaded R2 object; drops the old one. */
  async setVariantImage(
    userId: string,
    productId: string,
    variantId: string,
    input: SetVariantImageInput,
  ): Promise<ProductDetail> {
    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, productId, userId, deletedAt: null },
      select: { id: true, imageKey: true },
    });
    if (!variant) throw CatalogError.notFound('Variant not found.');
    if (!storageService.ownsKey(input.imageKey, userId)) {
      throw CatalogError.validation('Invalid image reference.');
    }

    await prisma.productVariant.update({
      where: { id: variantId },
      data: { imageKey: input.imageKey, imageUrl: input.imageUrl },
    });

    if (variant.imageKey && variant.imageKey !== input.imageKey) {
      await this.deleteStorageObject(variant.imageKey);
    }

    appLogger.info('catalog.variant.image.set', { userId, productId, variantId });
    return this.getProductById(userId, productId);
  }

  /** Remove a variant's photo (clears the fields + deletes the R2 object). */
  async removeVariantImage(
    userId: string,
    productId: string,
    variantId: string,
  ): Promise<ProductDetail> {
    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, productId, userId, deletedAt: null },
      select: { id: true, imageKey: true },
    });
    if (!variant) throw CatalogError.notFound('Variant not found.');

    await prisma.productVariant.update({
      where: { id: variantId },
      data: { imageKey: null, imageUrl: null },
    });

    if (variant.imageKey) await this.deleteStorageObject(variant.imageKey);

    appLogger.info('catalog.variant.image.removed', { userId, productId, variantId });
    return this.getProductById(userId, productId);
  }

  /**
   * Paginated list of bundles with each bundle's live "available" count (how many whole
   * bundles its component stock can build). Searches the bundle's own sku/name. Bundles
   * are few, so the summary + status filter are computed in memory across the search set.
   */
  async listBundles(
    userId: string,
    query: ListBundlesQuery,
  ): Promise<PaginatedResult<BundleListItem> & { summary: BundleListSummary }> {
    const term = query.q.trim();
    const where: Prisma.BundleWhereInput = {
      userId,
      ...(term
        ? {
            OR: [
              { sku: { contains: term, mode: 'insensitive' } },
              { name: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const bundles = await prisma.bundle.findMany({
      where,
      include: {
        items: {
          select: {
            quantity: true,
            productVariant: {
              select: { deletedAt: true, inventory: { select: { availableStock: true } } },
            },
          },
        },
      },
      orderBy: [{ name: 'asc' }],
    });

    const all: BundleListItem[] = bundles.map((bundle) => ({
      id: bundle.id,
      name: bundle.name,
      sku: bundle.sku,
      imageUrl: bundle.imageUrl,
      price: bundle.price.toString(),
      isActive: bundle.isActive,
      labelPrintedAt: bundle.labelPrintedAt?.toISOString() ?? null,
      totalVariant: bundle.items.length,
      available: computeBuildableQty(
        bundle.items.map((item) => ({
          quantity: item.quantity,
          availableStock: item.productVariant.deletedAt
            ? 0
            : (item.productVariant.inventory?.availableStock ?? 0),
        })),
      ),
    }));

    const summary: BundleListSummary = {
      total: all.length,
      available: all.filter((bundle) => bundle.available > 0).length,
      unavailable: all.filter((bundle) => bundle.available <= 0).length,
    };

    const filtered =
      query.status === 'available'
        ? all.filter((bundle) => bundle.available > 0)
        : query.status === 'unavailable'
          ? all.filter((bundle) => bundle.available <= 0)
          : all;

    const start = (query.page - 1) * query.pageSize;
    const pageItems = filtered.slice(start, start + query.pageSize);

    return {
      ...buildPaginatedResult(pageItems, filtered.length, query.page, query.pageSize),
      summary,
    };
  }

  /** A bundle's full composition for the edit screen. */
  async getBundle(userId: string, bundleId: string): Promise<BundleDetail> {
    return this.buildBundleDetail(userId, bundleId);
  }

  /** Bundles for the label studio — printable, paginated, not-yet-printed first. */
  async listBundleLabels(
    userId: string,
    query: LabelVariantsQuery,
  ): Promise<PaginatedResult<BundleLabel>> {
    const term = query.q.trim();
    const where: Prisma.BundleWhereInput = {
      userId,
      ...(term
        ? {
            OR: [
              { sku: { contains: term, mode: 'insensitive' } },
              { barcode: { contains: term, mode: 'insensitive' } },
              { name: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [bundles, total] = await Promise.all([
      prisma.bundle.findMany({
        where,
        orderBy: [{ labelPrintedAt: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.bundle.count({ where }),
    ]);

    const items: BundleLabel[] = bundles.map((bundle) => ({
      bundleId: bundle.id,
      name: bundle.name,
      sku: bundle.sku,
      barcode: bundle.barcode,
      price: bundle.price.toString(),
      imageUrl: bundle.imageUrl,
      labelPrintedAt: bundle.labelPrintedAt?.toISOString() ?? null,
    }));

    return buildPaginatedResult(items, total, query.page, query.pageSize);
  }

  /** Stamp the label-printed time for the given bundles (re-printing is allowed). */
  async markBundleLabelsPrinted(userId: string, bundleIds: string[]): Promise<void> {
    const ids = [...new Set(bundleIds)];
    if (ids.length === 0) return;
    await prisma.bundle.updateMany({
      where: { id: { in: ids }, userId },
      data: { labelPrintedAt: new Date() },
    });
    appLogger.info('catalog.bundle.labels.printed', { userId, count: ids.length });
  }

  /** Create a bundle: validate the SKU is free (across bundles + variants) and the components. */
  async createBundle(userId: string, input: CreateBundleInput): Promise<{ id: string }> {
    await this.assertBundleSkuAvailable(userId, input.sku);
    await this.assertBundleItemsValid(userId, input.items);

    const bundle = await prisma.bundle.create({
      data: {
        userId,
        name: input.name,
        sku: input.sku,
        barcode: input.barcode ?? null,
        price: input.price,
        items: {
          create: input.items.map((item) => ({
            productVariantId: item.productVariantId,
            quantity: item.quantity,
          })),
        },
      },
      select: { id: true },
    });

    appLogger.info('catalog.bundle.created', {
      userId,
      bundleId: bundle.id,
      items: input.items.length,
    });
    return { id: bundle.id };
  }

  /** Update a bundle's identity + replace its component set in one transaction. */
  async updateBundle(
    userId: string,
    bundleId: string,
    input: UpdateBundleInput,
  ): Promise<BundleDetail> {
    await this.assertBundleOwned(userId, bundleId);
    await this.assertBundleSkuAvailable(userId, input.sku, bundleId);
    await this.assertBundleItemsValid(userId, input.items);

    await prisma.$transaction(async (tx) => {
      await tx.bundle.update({
        where: { id: bundleId },
        data: {
          name: input.name,
          sku: input.sku,
          barcode: input.barcode ?? null,
          price: input.price,
          isActive: input.isActive,
        },
      });
      await tx.bundleItem.deleteMany({ where: { bundleId } });
      await tx.bundleItem.createMany({
        data: input.items.map((item) => ({
          bundleId,
          productVariantId: item.productVariantId,
          quantity: item.quantity,
        })),
      });
    });

    appLogger.info('catalog.bundle.updated', { userId, bundleId, items: input.items.length });
    return this.buildBundleDetail(userId, bundleId);
  }

  /** Delete a bundle (cascades its items). Past sale/PO lines keep their name snapshots. */
  async deleteBundle(userId: string, bundleId: string): Promise<void> {
    await this.assertBundleOwned(userId, bundleId);
    const bundle = await prisma.bundle.findUnique({
      where: { id: bundleId },
      select: { imageKey: true },
    });
    await prisma.bundle.delete({ where: { id: bundleId } });
    if (bundle?.imageKey) await this.deleteStorageObject(bundle.imageKey);
    appLogger.info('catalog.bundle.deleted', { userId, bundleId });
  }

  /** Set/replace a bundle's image from a just-uploaded R2 object; drops the old one. */
  async setBundleImage(
    userId: string,
    bundleId: string,
    input: SetVariantImageInput,
  ): Promise<BundleDetail> {
    const bundle = await prisma.bundle.findFirst({
      where: { id: bundleId, userId },
      select: { id: true, imageKey: true },
    });
    if (!bundle) throw CatalogError.notFound('Bundle not found.');
    if (!storageService.ownsKey(input.imageKey, userId)) {
      throw CatalogError.validation('Invalid image reference.');
    }

    await prisma.bundle.update({
      where: { id: bundleId },
      data: { imageKey: input.imageKey, imageUrl: input.imageUrl },
    });
    if (bundle.imageKey && bundle.imageKey !== input.imageKey) {
      await this.deleteStorageObject(bundle.imageKey);
    }

    appLogger.info('catalog.bundle.image.set', { userId, bundleId });
    return this.buildBundleDetail(userId, bundleId);
  }

  /** Remove a bundle's image (clears the fields + deletes the R2 object). */
  async removeBundleImage(userId: string, bundleId: string): Promise<BundleDetail> {
    const bundle = await prisma.bundle.findFirst({
      where: { id: bundleId, userId },
      select: { id: true, imageKey: true },
    });
    if (!bundle) throw CatalogError.notFound('Bundle not found.');

    await prisma.bundle.update({
      where: { id: bundleId },
      data: { imageKey: null, imageUrl: null },
    });
    if (bundle.imageKey) await this.deleteStorageObject(bundle.imageKey);

    appLogger.info('catalog.bundle.image.removed', { userId, bundleId });
    return this.buildBundleDetail(userId, bundleId);
  }

  /** Resolve bundles by id for stock/price math (sale/PO explosion). Unknown ids are absent. */
  async resolveBundles(
    userId: string,
    bundleIds: string[],
  ): Promise<Map<string, BundleResolution>> {
    const resolved = new Map<string, BundleResolution>();
    if (bundleIds.length === 0) return resolved;

    const bundles = await prisma.bundle.findMany({
      where: { id: { in: bundleIds }, userId },
      include: bundleDetailInclude,
    });
    for (const bundle of bundles) {
      const components = toBundleComponentLines(bundle);
      resolved.set(bundle.id, {
        id: bundle.id,
        name: bundle.name,
        sku: bundle.sku,
        price: bundle.price.toString(),
        components,
        available: computeBuildableQty(
          components.map((component) => ({
            quantity: component.quantity,
            availableStock: component.availableStock,
          })),
        ),
      });
    }
    return resolved;
  }

  /** Resolve a scanned code (barcode then SKU, case-insensitive) to a bundle. */
  async resolveBundleByCode(userId: string, code: string): Promise<BundleResolution | null> {
    const term = code.trim();
    if (!term) return null;

    const bundle =
      (await prisma.bundle.findFirst({
        where: { userId, isActive: true, barcode: { equals: term, mode: 'insensitive' } },
        select: { id: true },
      })) ??
      (await prisma.bundle.findFirst({
        where: { userId, isActive: true, sku: { equals: term, mode: 'insensitive' } },
        select: { id: true },
      }));
    if (!bundle) return null;

    return (await this.resolveBundles(userId, [bundle.id])).get(bundle.id) ?? null;
  }

  private async buildBundleDetail(userId: string, bundleId: string): Promise<BundleDetail> {
    const bundle = await prisma.bundle.findFirst({
      where: { id: bundleId, userId },
      include: bundleDetailInclude,
    });
    if (!bundle) throw CatalogError.notFound('Bundle not found.');

    const components = toBundleComponentLines(bundle);

    return {
      id: bundle.id,
      name: bundle.name,
      sku: bundle.sku,
      barcode: bundle.barcode,
      price: bundle.price.toString(),
      isActive: bundle.isActive,
      imageUrl: bundle.imageUrl,
      components,
      available: computeBuildableQty(
        components.map((component) => ({
          quantity: component.quantity,
          availableStock: component.availableStock,
        })),
      ),
    };
  }

  private async assertBundleOwned(userId: string, bundleId: string): Promise<void> {
    const bundle = await prisma.bundle.findFirst({
      where: { id: bundleId, userId },
      select: { id: true },
    });
    if (!bundle) throw CatalogError.notFound('Bundle not found.');
  }

  /**
   * A bundle SKU must be unique among the user's bundles AND not collide with a variant
   * SKU — both are scannable, so they share one code namespace.
   */
  private async assertBundleSkuAvailable(
    userId: string,
    sku: string,
    excludeBundleId?: string,
  ): Promise<void> {
    const [bundleClash, variantClash] = await Promise.all([
      prisma.bundle.findFirst({
        where: { userId, sku, ...(excludeBundleId ? { id: { not: excludeBundleId } } : {}) },
        select: { id: true },
      }),
      prisma.productVariant.findFirst({
        where: { userId, sku, deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (bundleClash || variantClash) throw CatalogError.duplicateSku(sku);
  }

  /** Components must be distinct + owned + active (not soft-deleted). */
  private async assertBundleItemsValid(
    userId: string,
    items: { productVariantId: string; quantity: number }[],
  ): Promise<void> {
    const ids = items.map((item) => item.productVariantId);
    if (new Set(ids).size !== ids.length) {
      throw CatalogError.validation('A component is listed more than once.');
    }
    const owned = await prisma.productVariant.findMany({
      where: { id: { in: ids }, userId, deletedAt: null },
      select: { id: true },
    });
    if (owned.length !== ids.length) {
      throw CatalogError.validation('A selected component no longer exists.');
    }
  }

  /** Best-effort image delete — a failed cleanup must not fail the request. */
  private async deleteStorageObject(storageKey: string): Promise<void> {
    try {
      await storageService.deleteImageObject(storageKey);
    } catch {
      appLogger.warn('catalog.variant.image.delete_failed', { storageKey });
    }
  }

  async deleteProduct(userId: string, productId: string): Promise<void> {
    await this.assertProductOwned(userId, productId);

    const { blockers, variants } = await this.computeDeletionBlockers(userId, productId);
    if (blockers.blocked) {
      throw CatalogError.validation(`Cannot delete. ${blockers.reasons.join(' ')}`);
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await this.archiveVariantRows(tx, variants, now);
      await tx.product.update({ where: { id: productId }, data: { deletedAt: now } });
    });

    appLogger.info('catalog.product.deleted', { userId, productId, variants: variants.length });
  }

  /**
   * Soft-delete one variant or a whole group's leaves. Blocked when any target is
   * mapped to a marketplace, has reserved/incoming stock, or has an open return.
   * Stock history is kept; each freed SKU becomes reusable.
   */
  async deleteVariants(userId: string, productId: string, variantIds: string[]): Promise<void> {
    await this.assertProductOwned(userId, productId);

    const { blockers, variants } = await this.computeDeletionBlockers(
      userId,
      productId,
      variantIds,
    );
    if (variants.length === 0) throw CatalogError.notFound('Variant not found.');
    if (blockers.blocked) {
      throw CatalogError.validation(`Cannot delete. ${blockers.reasons.join(' ')}`);
    }

    const now = new Date();
    await prisma.$transaction((tx) => this.archiveVariantRows(tx, variants, now));

    appLogger.info('catalog.variants.deleted', { userId, productId, count: variants.length });
  }

  /**
   * Why a delete is (not) allowed. Scopes to `variantIds` when given, else every
   * active variant of the product. Hard blockers: marketplace mapping, reserved or
   * incoming stock, an open (PENDING) return. Soft warnings: on-hand + damaged stock.
   */
  async getDeletionBlockers(
    userId: string,
    productId: string,
    variantIds?: string[],
  ): Promise<DeletionBlockers> {
    await this.assertProductOwned(userId, productId);
    return (await this.computeDeletionBlockers(userId, productId, variantIds)).blockers;
  }

  private async computeDeletionBlockers(
    userId: string,
    productId: string,
    variantIds?: string[],
  ): Promise<{ blockers: DeletionBlockers; variants: { id: string; sku: string }[] }> {
    const variants = await prisma.productVariant.findMany({
      where: {
        productId,
        userId,
        deletedAt: null,
        ...(variantIds ? { id: { in: variantIds } } : {}),
      },
      select: {
        id: true,
        sku: true,
        name: true,
        inventory: {
          select: {
            reservedStock: true,
            incomingStock: true,
            availableStock: true,
            damagedStock: true,
          },
        },
      },
    });

    const ids = variants.map((variant) => variant.id);
    const [mapped, openReturns] = await Promise.all([
      marketplaceMappingService.getMappedVariantIds(userId, ids),
      returnsServerService.getVariantIdsWithOpenReturns(userId, ids),
    ]);

    const reasons: string[] = [];
    const warnings: string[] = [];

    const mappedNames = variants.filter((variant) => mapped.has(variant.id)).map((v) => v.name);
    if (mappedNames.length > 0) {
      reasons.push(
        `${quoteNames(mappedNames)} ${mappedNames.length === 1 ? 'is' : 'are'} mapped to a marketplace — unmap first.`,
      );
    }

    const returnNames = variants
      .filter((variant) => openReturns.has(variant.id))
      .map((v) => v.name);
    if (returnNames.length > 0) {
      reasons.push(
        `${quoteNames(returnNames)} ${returnNames.length === 1 ? 'has' : 'have'} an open return — process it first.`,
      );
    }

    const reserved = sumInventory(variants, 'reservedStock');
    if (reserved > 0) {
      reasons.push(`${reserved} unit${reserved === 1 ? '' : 's'} reserved for unshipped orders.`);
    }

    const incoming = sumInventory(variants, 'incomingStock');
    if (incoming > 0) {
      reasons.push(
        `${incoming} unit${incoming === 1 ? '' : 's'} incoming from open purchase orders.`,
      );
    }

    const available = sumInventory(variants, 'availableStock');
    if (available > 0) warnings.push(`${available} in stock will be archived.`);

    const damaged = sumInventory(variants, 'damagedStock');
    if (damaged > 0) warnings.push(`${damaged} damaged unit${damaged === 1 ? '' : 's'} recorded.`);

    return {
      blockers: { blocked: reasons.length > 0, reasons, warnings, variantCount: variants.length },
      variants: variants.map((variant) => ({ id: variant.id, sku: variant.sku })),
    };
  }

  /** Soft-delete the given variants, freeing each SKU for reuse (see archivedSku). */
  private async archiveVariantRows(
    tx: Prisma.TransactionClient,
    variants: { id: string; sku: string }[],
    now: Date,
  ): Promise<void> {
    for (const variant of variants) {
      await tx.productVariant.update({
        where: { id: variant.id },
        data: { deletedAt: now, sku: archivedSku(variant.sku, variant.id) },
      });
    }
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

  /** Reject duplicate SKUs within the batch, then any already used by the account. */
  private async assertSkusAvailable(userId: string, skus: string[]): Promise<void> {
    const duplicate = skus.find((sku, index) => skus.indexOf(sku) !== index);
    if (duplicate) throw CatalogError.validation(`Duplicate SKU "${duplicate}".`);
    for (const sku of skus) await this.assertSkuAvailable(userId, sku);
  }

  /** Create the given leaf variants inside a transaction, returning their ids in order. */
  private async createVariantLeaves(
    tx: Prisma.TransactionClient,
    userId: string,
    productId: string,
    inputs: CreateVariantInput[],
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const input of inputs) {
      const variant = await tx.productVariant.create({
        data: buildVariantData(userId, productId, input),
        select: { id: true },
      });
      ids.push(variant.id);
    }
    return ids;
  }

  /** Ensure inventory + apply the initial stock for each freshly created leaf. */
  private async initVariantStocks(
    userId: string,
    variantIds: string[],
    inputs: CreateVariantInput[],
  ): Promise<void> {
    for (let index = 0; index < variantIds.length; index += 1) {
      const variantId = variantIds[index];
      const input = inputs[index];
      if (variantId && input)
        await this.initializeVariantStock(userId, variantId, input.initialStock);
    }
  }
}

export const catalogServerService = new CatalogServerService();
