import 'server-only';

import { buildPaginatedResult, notDeleted, prisma, type PaginatedResult } from '@falka/db';
import { Prisma, type Inventory, type Product, type ProductVariant } from '@prisma/client';

import { appLogger } from '@/lib/logger';
import { auditService } from '@/modules/audit/services/audit.service';
import { inventoryServerService } from '@/modules/inventory/services/inventory-server.service';
import { marketplaceMappingService } from '@/modules/marketplace/services/marketplace-mapping.service';
import { returnsServerService } from '@/modules/returns/services/returns-server.service';
import { storageService } from '@/modules/storage/services/storage.service';

import { CatalogError } from '../errors/catalog-errors';
import type {
  ArchivedBundleItem,
  ArchivedVariantItem,
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
import { archivedSku, unarchiveSku } from '../utils/variants';
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
    supplierId: variant.supplierId,
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
  organizationId: string,
  actorUserId: string,
  productId: string,
  input: CreateVariantInput,
): Prisma.ProductVariantUncheckedCreateInput {
  return {
    userId: actorUserId,
    organizationId,
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
    organizationId: string,
    query: LabelVariantsQuery,
  ): Promise<PaginatedResult<LabelVariant>> {
    const term = query.q.trim();
    const where: Prisma.ProductVariantWhereInput = {
      organizationId,
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
  async markLabelsPrinted(organizationId: string, variantIds: string[]): Promise<void> {
    const ids = [...new Set(variantIds)];
    if (ids.length === 0) return;

    const result = await prisma.productVariant.updateMany({
      where: { id: { in: ids }, organizationId, deletedAt: null },
      data: { labelPrintedAt: new Date() },
    });

    appLogger.info('catalog.labels.printed', {
      organizationId,
      requested: ids.length,
      updated: result.count,
    });
  }

  async listProducts(
    organizationId: string,
    query: ListProductsQuery,
  ): Promise<PaginatedResult<ProductListItem>> {
    const where: Prisma.ProductWhereInput = {
      organizationId,
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

  async getProductById(organizationId: string, productId: string): Promise<ProductDetail> {
    const product = await prisma.product.findFirst({
      where: { id: productId, organizationId, ...notDeleted },
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
      organizationId,
      product.variants.map((variant) => variant.id),
    );

    return mapProductDetail(product, mappingsByVariant);
  }

  async createProduct(
    organizationId: string,
    actorUserId: string,
    input: CreateProductInput,
  ): Promise<ProductDetail> {
    await this.assertSkusAvailable(
      organizationId,
      input.variants.map((variant) => variant.sku),
    );

    let productId: string;
    let variantIds: string[];
    try {
      const created = await prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            userId: actorUserId,
            organizationId,
            name: input.name,
            description: input.description ?? null,
            category: input.category ?? null,
          },
        });
        const ids = await this.createVariantLeaves(
          tx,
          organizationId,
          actorUserId,
          product.id,
          input.variants,
        );
        return { productId: product.id, variantIds: ids };
      });
      productId = created.productId;
      variantIds = created.variantIds;
    } catch (error) {
      if (isUniqueConstraintError(error))
        throw CatalogError.duplicateSku(input.variants[0]?.sku ?? '');
      throw error;
    }

    await this.initVariantStocks(organizationId, actorUserId, variantIds, input.variants);

    appLogger.info('catalog.product.created', {
      organizationId,
      actorUserId,
      productId,
      variants: variantIds.length,
    });

    return this.getProductById(organizationId, productId);
  }

  /**
   * Add one or more leaf variants to a product in one go — a standalone variant
   * (single input) or a grouped variant (one input per subvariant, all sharing a
   * `variantGroup`). Rows are created in a transaction; stock is then initialized
   * per leaf. SKUs must be unique within the batch and across the account.
   */
  async addVariants(
    organizationId: string,
    actorUserId: string,
    productId: string,
    inputs: CreateVariantInput[],
  ): Promise<ProductVariantItem[]> {
    await this.assertProductOwned(organizationId, productId);
    await this.assertSkusAvailable(
      organizationId,
      inputs.map((input) => input.sku),
    );

    let variantIds: string[];
    try {
      variantIds = await prisma.$transaction((tx) =>
        this.createVariantLeaves(tx, organizationId, actorUserId, productId, inputs),
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) throw CatalogError.duplicateSku(inputs[0]?.sku ?? '');
      throw error;
    }

    await this.initVariantStocks(organizationId, actorUserId, variantIds, inputs);

    appLogger.info('catalog.variants.created', {
      organizationId,
      actorUserId,
      productId,
      count: variantIds.length,
    });

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
    organizationId: string,
    productId: string,
    variantId: string,
    input: UpdateVariantInput,
  ): Promise<ProductVariantItem> {
    await this.assertProductOwned(organizationId, productId);

    const owned = await prisma.productVariant.findFirst({
      where: { id: variantId, productId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!owned) throw CatalogError.notFound('Variant not found.');

    // A non-null supplier must belong to this org (and not be soft-deleted) — guards against
    // assigning another tenant's supplier. null clears the link.
    if (input.supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: { id: input.supplierId, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!supplier) throw CatalogError.validation('Pemasok tidak ditemukan.');
    }

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
        ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
      },
    });

    appLogger.info('catalog.variant.updated', { organizationId, productId, variantId });

    const updated = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
      include: { inventory: true },
    });

    return mapVariant(updated);
  }

  async updateProduct(
    organizationId: string,
    productId: string,
    input: UpdateProductInput,
  ): Promise<ProductDetail> {
    await this.assertProductOwned(organizationId, productId);

    await prisma.product.update({
      where: { id: productId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    appLogger.info('catalog.product.updated', { organizationId, productId });

    return this.getProductById(organizationId, productId);
  }

  /** Set/replace a variant's photo from a just-uploaded R2 object; drops the old one. */
  async setVariantImage(
    organizationId: string,
    productId: string,
    variantId: string,
    input: SetVariantImageInput,
  ): Promise<ProductDetail> {
    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, productId, organizationId, deletedAt: null },
      select: { id: true, imageKey: true },
    });
    if (!variant) throw CatalogError.notFound('Variant not found.');
    if (!storageService.ownsKey(input.imageKey, organizationId)) {
      throw CatalogError.validation('Invalid image reference.');
    }

    await prisma.productVariant.update({
      where: { id: variantId },
      data: { imageKey: input.imageKey, imageUrl: input.imageUrl },
    });

    if (variant.imageKey && variant.imageKey !== input.imageKey) {
      await this.deleteStorageObject(variant.imageKey);
    }

    appLogger.info('catalog.variant.image.set', { organizationId, productId, variantId });
    return this.getProductById(organizationId, productId);
  }

  /** Remove a variant's photo (clears the fields + deletes the R2 object). */
  async removeVariantImage(
    organizationId: string,
    productId: string,
    variantId: string,
  ): Promise<ProductDetail> {
    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, productId, organizationId, deletedAt: null },
      select: { id: true, imageKey: true },
    });
    if (!variant) throw CatalogError.notFound('Variant not found.');

    await prisma.productVariant.update({
      where: { id: variantId },
      data: { imageKey: null, imageUrl: null },
    });

    if (variant.imageKey) await this.deleteStorageObject(variant.imageKey);

    appLogger.info('catalog.variant.image.removed', { organizationId, productId, variantId });
    return this.getProductById(organizationId, productId);
  }

  /**
   * Paginated list of bundles with each bundle's live "available" count (how many whole
   * bundles its component stock can build). Searches the bundle's own sku/name. Bundles
   * are few, so the summary + status filter are computed in memory across the search set.
   */
  async listBundles(
    organizationId: string,
    query: ListBundlesQuery,
  ): Promise<PaginatedResult<BundleListItem> & { summary: BundleListSummary }> {
    const term = query.q.trim();
    const where: Prisma.BundleWhereInput = {
      organizationId,
      deletedAt: null,
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
  async getBundle(organizationId: string, bundleId: string): Promise<BundleDetail> {
    return this.buildBundleDetail(organizationId, bundleId);
  }

  /** Bundles for the label studio — printable, paginated, not-yet-printed first. */
  async listBundleLabels(
    organizationId: string,
    query: LabelVariantsQuery,
  ): Promise<PaginatedResult<BundleLabel>> {
    const term = query.q.trim();
    const where: Prisma.BundleWhereInput = {
      organizationId,
      deletedAt: null,
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
  async markBundleLabelsPrinted(organizationId: string, bundleIds: string[]): Promise<void> {
    const ids = [...new Set(bundleIds)];
    if (ids.length === 0) return;
    await prisma.bundle.updateMany({
      where: { id: { in: ids }, organizationId, deletedAt: null },
      data: { labelPrintedAt: new Date() },
    });
    appLogger.info('catalog.bundle.labels.printed', { organizationId, count: ids.length });
  }

  /** Create a bundle: validate the SKU is free (across bundles + variants) and the components. */
  async createBundle(
    organizationId: string,
    actorUserId: string,
    input: CreateBundleInput,
  ): Promise<{ id: string }> {
    await this.assertBundleSkuAvailable(organizationId, input.sku);
    await this.assertBundleItemsValid(organizationId, input.items);

    const bundle = await prisma.bundle.create({
      data: {
        userId: actorUserId,
        organizationId,
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
      organizationId,
      actorUserId,
      bundleId: bundle.id,
      items: input.items.length,
    });
    return { id: bundle.id };
  }

  /** Update a bundle's identity + replace its component set in one transaction. */
  async updateBundle(
    organizationId: string,
    bundleId: string,
    input: UpdateBundleInput,
  ): Promise<BundleDetail> {
    await this.assertBundleOwned(organizationId, bundleId);
    await this.assertBundleSkuAvailable(organizationId, input.sku, bundleId);
    await this.assertBundleItemsValid(organizationId, input.items);

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

    appLogger.info('catalog.bundle.updated', {
      organizationId,
      bundleId,
      items: input.items.length,
    });
    return this.buildBundleDetail(organizationId, bundleId);
  }

  /**
   * Archive a bundle (soft-delete): free its SKU like a variant and hide it from
   * every list/scan, keeping its composition + image so it can be restored. Past
   * sale/PO lines kept their own name snapshots regardless.
   */
  async deleteBundle(organizationId: string, actorUserId: string, bundleId: string): Promise<void> {
    await this.assertBundleOwned(organizationId, bundleId);
    const bundle = await prisma.bundle.findUnique({
      where: { id: bundleId },
      select: { sku: true, name: true },
    });
    if (!bundle) throw CatalogError.notFound('Bundle not found.');

    await prisma.bundle.update({
      where: { id: bundleId },
      data: { deletedAt: new Date(), sku: archivedSku(bundle.sku, bundleId) },
    });
    appLogger.info('catalog.bundle.archived', { organizationId, bundleId });
    void auditService.log({
      organizationId,
      actorUserId,
      action: 'catalog.bundle_deleted',
      resource: 'bundle',
      resourceId: bundleId,
      metadata: { sku: bundle.sku, name: bundle.name },
    });
  }

  /**
   * The user's archived bundles, newest-archived first, each with the original SKU
   * restore would reinstate and whether that SKU is still free across live
   * variants/bundles. A 0-component bundle was auto-archived when its last component
   * variant was deleted.
   */
  async listArchivedBundles(organizationId: string): Promise<ArchivedBundleItem[]> {
    const rows = await prisma.bundle.findMany({
      where: { organizationId, deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      select: {
        id: true,
        sku: true,
        name: true,
        imageUrl: true,
        deletedAt: true,
        _count: { select: { items: true } },
      },
    });

    const taken = await this.takenSkus(
      organizationId,
      rows.map((row) => unarchiveSku(row.sku, row.id)),
    );

    return rows.flatMap((row) => {
      if (!row.deletedAt) return [];
      const sku = unarchiveSku(row.sku, row.id);
      const restorable = !taken.has(sku);
      return [
        {
          id: row.id,
          sku,
          name: row.name,
          imageUrl: row.imageUrl,
          componentCount: row._count.items,
          restorable,
          blockReason: restorable ? null : `SKU "${sku}" sudah dipakai varian atau bundel lain.`,
          deletedAt: row.deletedAt.toISOString(),
        },
      ];
    });
  }

  /**
   * Bring an archived bundle back: reinstate its original SKU and clear `deletedAt`.
   * Refused when a live variant or bundle now owns that SKU (the shared scan namespace
   * must stay unique); the unique index is the final guard against a race. A restored
   * bundle may have 0 components (auto-archived) — the edit screen lets the user re-add.
   */
  async restoreBundle(organizationId: string, bundleId: string): Promise<{ id: string }> {
    const archived = await prisma.bundle.findFirst({
      where: { id: bundleId, organizationId, deletedAt: { not: null } },
      select: { id: true, sku: true },
    });
    if (!archived) throw CatalogError.notFound('Archived bundle not found.');

    const sku = unarchiveSku(archived.sku, archived.id);
    if ((await this.takenSkus(organizationId, [sku])).has(sku))
      throw CatalogError.duplicateSku(sku);

    try {
      await prisma.bundle.update({
        where: { id: bundleId },
        data: { deletedAt: null, sku },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw CatalogError.duplicateSku(sku);
      throw error;
    }

    appLogger.info('catalog.bundle.restored', { organizationId, bundleId });
    return { id: bundleId };
  }

  /** Set/replace a bundle's image from a just-uploaded R2 object; drops the old one. */
  async setBundleImage(
    organizationId: string,
    bundleId: string,
    input: SetVariantImageInput,
  ): Promise<BundleDetail> {
    const bundle = await prisma.bundle.findFirst({
      where: { id: bundleId, organizationId },
      select: { id: true, imageKey: true },
    });
    if (!bundle) throw CatalogError.notFound('Bundle not found.');
    if (!storageService.ownsKey(input.imageKey, organizationId)) {
      throw CatalogError.validation('Invalid image reference.');
    }

    await prisma.bundle.update({
      where: { id: bundleId },
      data: { imageKey: input.imageKey, imageUrl: input.imageUrl },
    });
    if (bundle.imageKey && bundle.imageKey !== input.imageKey) {
      await this.deleteStorageObject(bundle.imageKey);
    }

    appLogger.info('catalog.bundle.image.set', { organizationId, bundleId });
    return this.buildBundleDetail(organizationId, bundleId);
  }

  /** Remove a bundle's image (clears the fields + deletes the R2 object). */
  async removeBundleImage(organizationId: string, bundleId: string): Promise<BundleDetail> {
    const bundle = await prisma.bundle.findFirst({
      where: { id: bundleId, organizationId },
      select: { id: true, imageKey: true },
    });
    if (!bundle) throw CatalogError.notFound('Bundle not found.');

    await prisma.bundle.update({
      where: { id: bundleId },
      data: { imageKey: null, imageUrl: null },
    });
    if (bundle.imageKey) await this.deleteStorageObject(bundle.imageKey);

    appLogger.info('catalog.bundle.image.removed', { organizationId, bundleId });
    return this.buildBundleDetail(organizationId, bundleId);
  }

  /** Resolve bundles by id for stock/price math (sale/PO explosion). Unknown ids are absent. */
  async resolveBundles(
    organizationId: string,
    bundleIds: string[],
  ): Promise<Map<string, BundleResolution>> {
    const resolved = new Map<string, BundleResolution>();
    if (bundleIds.length === 0) return resolved;

    const bundles = await prisma.bundle.findMany({
      where: { id: { in: bundleIds }, organizationId, deletedAt: null },
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
  async resolveBundleByCode(
    organizationId: string,
    code: string,
  ): Promise<BundleResolution | null> {
    const term = code.trim();
    if (!term) return null;

    const bundle =
      (await prisma.bundle.findFirst({
        where: {
          organizationId,
          isActive: true,
          deletedAt: null,
          barcode: { equals: term, mode: 'insensitive' },
        },
        select: { id: true },
      })) ??
      (await prisma.bundle.findFirst({
        where: {
          organizationId,
          isActive: true,
          deletedAt: null,
          sku: { equals: term, mode: 'insensitive' },
        },
        select: { id: true },
      }));
    if (!bundle) return null;

    return (await this.resolveBundles(organizationId, [bundle.id])).get(bundle.id) ?? null;
  }

  private async buildBundleDetail(organizationId: string, bundleId: string): Promise<BundleDetail> {
    const bundle = await prisma.bundle.findFirst({
      where: { id: bundleId, organizationId, deletedAt: null },
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

  private async assertBundleOwned(organizationId: string, bundleId: string): Promise<void> {
    const bundle = await prisma.bundle.findFirst({
      where: { id: bundleId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!bundle) throw CatalogError.notFound('Bundle not found.');
  }

  /**
   * A bundle SKU must be unique among the org's bundles AND not collide with a variant
   * SKU — both are scannable, so they share one code namespace.
   */
  private async assertBundleSkuAvailable(
    organizationId: string,
    sku: string,
    excludeBundleId?: string,
  ): Promise<void> {
    const [bundleClash, variantClash] = await Promise.all([
      prisma.bundle.findFirst({
        where: {
          organizationId,
          sku,
          deletedAt: null,
          ...(excludeBundleId ? { id: { not: excludeBundleId } } : {}),
        },
        select: { id: true },
      }),
      prisma.productVariant.findFirst({
        where: { organizationId, sku, deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (bundleClash || variantClash) throw CatalogError.duplicateSku(sku);
  }

  /** Components must be distinct + owned + active (not soft-deleted). */
  private async assertBundleItemsValid(
    organizationId: string,
    items: { productVariantId: string; quantity: number }[],
  ): Promise<void> {
    const ids = items.map((item) => item.productVariantId);
    if (new Set(ids).size !== ids.length) {
      throw CatalogError.validation('A component is listed more than once.');
    }
    const owned = await prisma.productVariant.findMany({
      where: { id: { in: ids }, organizationId, deletedAt: null },
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

  async deleteProduct(
    organizationId: string,
    actorUserId: string,
    productId: string,
  ): Promise<void> {
    await this.assertProductOwned(organizationId, productId);

    const { blockers, variants } = await this.computeDeletionBlockers(organizationId, productId);
    if (blockers.blocked) {
      throw CatalogError.validation(`Cannot delete. ${blockers.reasons.join(' ')}`);
    }

    const now = new Date();
    const product = await prisma.$transaction(async (tx) => {
      await this.archiveVariantRows(tx, variants, now);
      await this.cascadeBundleComponentRemoval(
        tx,
        variants.map((variant) => variant.id),
        now,
      );
      return tx.product.update({ where: { id: productId }, data: { deletedAt: now } });
    });

    appLogger.info('catalog.product.deleted', {
      organizationId,
      productId,
      variants: variants.length,
    });
    void auditService.log({
      organizationId,
      actorUserId,
      action: 'catalog.product_deleted',
      resource: 'product',
      resourceId: productId,
      metadata: { name: product.name, variantCount: variants.length },
    });
  }

  /**
   * Soft-delete one variant or a whole group's leaves. Blocked when any target is
   * mapped to a marketplace, has reserved/incoming stock, or has an open return.
   * Stock history is kept; each freed SKU becomes reusable.
   */
  async deleteVariants(
    organizationId: string,
    actorUserId: string,
    productId: string,
    variantIds: string[],
  ): Promise<void> {
    await this.assertProductOwned(organizationId, productId);

    const { blockers, variants } = await this.computeDeletionBlockers(
      organizationId,
      productId,
      variantIds,
    );
    if (variants.length === 0) throw CatalogError.notFound('Variant not found.');
    if (blockers.blocked) {
      throw CatalogError.validation(`Cannot delete. ${blockers.reasons.join(' ')}`);
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await this.archiveVariantRows(tx, variants, now);
      await this.cascadeBundleComponentRemoval(
        tx,
        variants.map((variant) => variant.id),
        now,
      );
    });

    appLogger.info('catalog.variants.deleted', {
      organizationId,
      productId,
      count: variants.length,
    });
    for (const variant of variants) {
      void auditService.log({
        organizationId,
        actorUserId,
        action: 'catalog.variant_deleted',
        resource: 'product_variant',
        resourceId: variant.id,
        metadata: { sku: variant.sku, name: variant.name },
      });
    }
  }

  /**
   * The soft-deleted variants of a product, newest-archived first, each with the
   * original SKU restore would reinstate and whether that SKU is still free.
   */
  async listArchivedVariants(
    organizationId: string,
    productId: string,
  ): Promise<ArchivedVariantItem[]> {
    await this.assertProductOwned(organizationId, productId);

    const rows = await prisma.productVariant.findMany({
      where: { productId, organizationId, deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      select: { id: true, sku: true, name: true, variantGroup: true, deletedAt: true },
    });

    const taken = await this.takenSkus(
      organizationId,
      rows.map((row) => unarchiveSku(row.sku, row.id)),
    );

    return rows.flatMap((row) => {
      if (!row.deletedAt) return [];
      const sku = unarchiveSku(row.sku, row.id);
      const restorable = !taken.has(sku);
      return [
        {
          id: row.id,
          sku,
          name: row.name,
          variantGroup: row.variantGroup,
          restorable,
          blockReason: restorable ? null : `SKU "${sku}" sudah dipakai varian atau bundel lain.`,
          deletedAt: row.deletedAt.toISOString(),
        },
      ];
    });
  }

  /**
   * Bring a soft-deleted variant back: reinstate its original SKU and clear
   * `deletedAt`. Refused when another live variant or bundle now owns that SKU
   * (the shared scan namespace must stay unique) — the unique index is the final
   * guard against a race. The variant's Inventory row survived the soft-delete.
   */
  async restoreVariant(
    organizationId: string,
    productId: string,
    variantId: string,
  ): Promise<ProductVariantItem> {
    await this.assertProductOwned(organizationId, productId);

    const archived = await prisma.productVariant.findFirst({
      where: { id: variantId, productId, organizationId, deletedAt: { not: null } },
      select: { id: true, sku: true },
    });
    if (!archived) throw CatalogError.notFound('Archived variant not found.');

    const sku = unarchiveSku(archived.sku, archived.id);
    if ((await this.takenSkus(organizationId, [sku])).has(sku))
      throw CatalogError.duplicateSku(sku);

    let restored: VariantWithInventory;
    try {
      restored = await prisma.productVariant.update({
        where: { id: variantId },
        data: { deletedAt: null, sku },
        include: { inventory: true },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw CatalogError.duplicateSku(sku);
      throw error;
    }

    appLogger.info('catalog.variant.restored', { organizationId, productId, variantId });

    return mapVariant(restored);
  }

  /** The subset of `skus` currently owned by a live variant or a bundle (shared scan namespace). */
  private async takenSkus(organizationId: string, skus: string[]): Promise<Set<string>> {
    if (skus.length === 0) return new Set();
    const [variants, bundles] = await Promise.all([
      prisma.productVariant.findMany({
        where: { organizationId, sku: { in: skus }, deletedAt: null },
        select: { sku: true },
      }),
      prisma.bundle.findMany({
        where: { organizationId, sku: { in: skus }, deletedAt: null },
        select: { sku: true },
      }),
    ]);
    return new Set([...variants, ...bundles].map((row) => row.sku));
  }

  /**
   * Why a delete is (not) allowed. Scopes to `variantIds` when given, else every
   * active variant of the product. Hard blockers: marketplace mapping, reserved or
   * incoming stock, an open (PENDING) return. Soft warnings: on-hand + damaged stock.
   */
  async getDeletionBlockers(
    organizationId: string,
    productId: string,
    variantIds?: string[],
  ): Promise<DeletionBlockers> {
    await this.assertProductOwned(organizationId, productId);
    return (await this.computeDeletionBlockers(organizationId, productId, variantIds)).blockers;
  }

  private async computeDeletionBlockers(
    organizationId: string,
    productId: string,
    variantIds?: string[],
  ): Promise<{
    blockers: DeletionBlockers;
    variants: { id: string; sku: string; name: string }[];
  }> {
    const variants = await prisma.productVariant.findMany({
      where: {
        productId,
        organizationId,
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
      marketplaceMappingService.getMappedVariantIds(organizationId, ids),
      returnsServerService.getVariantIdsWithOpenReturns(organizationId, ids),
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

    const bundleLinks = await prisma.bundleItem.findMany({
      where: { productVariantId: { in: ids }, bundle: { deletedAt: null } },
      select: { bundleId: true, bundle: { select: { name: true } } },
    });
    if (bundleLinks.length > 0) {
      const nameByBundle = new Map(bundleLinks.map((link) => [link.bundleId, link.bundle.name]));
      const removedByBundle = new Map<string, number>();
      for (const link of bundleLinks) {
        removedByBundle.set(link.bundleId, (removedByBundle.get(link.bundleId) ?? 0) + 1);
      }
      const totals = await prisma.bundleItem.groupBy({
        by: ['bundleId'],
        where: { bundleId: { in: [...nameByBundle.keys()] } },
        _count: true,
      });
      const emptied = totals.filter(
        (total) => (removedByBundle.get(total.bundleId) ?? 0) >= total._count,
      ).length;
      const names = [...nameByBundle.values()];
      warnings.push(
        `Dipakai sebagai komponen di ${names.length} bundel (${quoteNames(names)}) — komponennya akan dihapus` +
          (emptied > 0 ? `, dan ${emptied} bundel yang jadi kosong akan diarsipkan.` : '.'),
      );
    }

    return {
      blockers: { blocked: reasons.length > 0, reasons, warnings, variantCount: variants.length },
      variants: variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        name: variant.name,
      })),
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

  /**
   * When variants are archived, drop them from every live bundle that lists them as
   * a component, then archive any such bundle left with no components (it can no
   * longer be built or sold). An archived bundle frees its SKU like a variant. Items
   * of already-archived bundles are left untouched so a restore keeps its composition.
   */
  private async cascadeBundleComponentRemoval(
    tx: Prisma.TransactionClient,
    variantIds: string[],
    now: Date,
  ): Promise<void> {
    if (variantIds.length === 0) return;

    const affected = await tx.bundleItem.findMany({
      where: { productVariantId: { in: variantIds }, bundle: { deletedAt: null } },
      select: { bundleId: true },
    });
    if (affected.length === 0) return;

    await tx.bundleItem.deleteMany({
      where: { productVariantId: { in: variantIds }, bundle: { deletedAt: null } },
    });

    for (const bundleId of [...new Set(affected.map((item) => item.bundleId))]) {
      if ((await tx.bundleItem.count({ where: { bundleId } })) > 0) continue;
      const bundle = await tx.bundle.findFirst({
        where: { id: bundleId, deletedAt: null },
        select: { id: true, sku: true },
      });
      if (!bundle) continue;
      await tx.bundle.update({
        where: { id: bundle.id },
        data: { deletedAt: now, sku: archivedSku(bundle.sku, bundle.id) },
      });
    }
  }

  private async initializeVariantStock(
    organizationId: string,
    actorUserId: string,
    variantId: string,
    initialStock: number,
  ): Promise<void> {
    await inventoryServerService.ensureInventory(variantId);

    if (initialStock > 0) {
      await inventoryServerService.adjustStock(organizationId, actorUserId, variantId, {
        delta: initialStock,
        reason: 'RESTOCK',
        note: 'Initial stock',
      });
    }
  }

  private async assertProductOwned(organizationId: string, productId: string): Promise<void> {
    const product = await prisma.product.findFirst({
      where: { id: productId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw CatalogError.notFound();
  }

  private async assertSkuAvailable(organizationId: string, sku: string): Promise<void> {
    const existing = await prisma.productVariant.findFirst({
      where: { organizationId, sku, deletedAt: null },
      select: { id: true },
    });
    if (existing) throw CatalogError.duplicateSku(sku);
  }

  /** Reject duplicate SKUs within the batch, then any already used by the organization. */
  private async assertSkusAvailable(organizationId: string, skus: string[]): Promise<void> {
    const duplicate = skus.find((sku, index) => skus.indexOf(sku) !== index);
    if (duplicate) throw CatalogError.validation(`Duplicate SKU "${duplicate}".`);
    for (const sku of skus) await this.assertSkuAvailable(organizationId, sku);
  }

  /** Create the given leaf variants inside a transaction, returning their ids in order. */
  private async createVariantLeaves(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actorUserId: string,
    productId: string,
    inputs: CreateVariantInput[],
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const input of inputs) {
      const variant = await tx.productVariant.create({
        data: buildVariantData(organizationId, actorUserId, productId, input),
        select: { id: true },
      });
      ids.push(variant.id);
    }
    return ids;
  }

  /** Ensure inventory + apply the initial stock for each freshly created leaf. */
  private async initVariantStocks(
    organizationId: string,
    actorUserId: string,
    variantIds: string[],
    inputs: CreateVariantInput[],
  ): Promise<void> {
    for (let index = 0; index < variantIds.length; index += 1) {
      const variantId = variantIds[index];
      const input = inputs[index];
      if (variantId && input)
        await this.initializeVariantStock(
          organizationId,
          actorUserId,
          variantId,
          input.initialStock,
        );
    }
  }
}

export const catalogServerService = new CatalogServerService();
