import 'server-only';

import { buildPaginatedResult, notDeleted, prisma, type PaginatedResult } from '@falka/db';
import type { Prisma, Inventory, Product, ProductVariant } from '@prisma/client';

import { appLogger } from '@/lib/logger';
import { auditService } from '@/modules/audit/services/audit.service';
import { inventoryServerService } from '@/modules/inventory/services/inventory-server.service';
import { marketplaceMappingService } from '@/modules/marketplace/services/marketplace-mapping.service';
import { returnsServerService } from '@/modules/returns/services/returns-server.service';
import { storageService } from '@/modules/storage/services/storage.service';

import { bundleServerService } from './bundle-server.service';
import { CatalogError } from '../errors/catalog-errors';
import type {
  ArchivedVariantItem,
  DeletionBlockers,
  LabelVariant,
  ProductDetail,
  ProductExportRow,
  ProductListItem,
  ProductVariantItem,
  VariantMappingRef,
} from '../types';
import { PRODUCT_EXPORT_CAP } from '../utils/product-csv';
import { isUniqueConstraintError } from '../utils/prisma-errors';
import { takenSkus } from '../utils/sku';
import { deleteStorageObject } from '../utils/storage';
import { archivedSku, unarchiveSku } from '../utils/variants';
import type { CreateProductInput } from '../validators/create-product';
import type { LabelVariantsQuery } from '../validators/label-variants';
import type { ListProductsQuery } from '../validators/list-products';
import type { UpdateProductInput } from '../validators/update-product';
import type { UpdateVariantDetailsInput } from '../validators/update-variant-details';
import type { UpdateVariantInput } from '../validators/update-variant';
import type { CreateVariantInput } from '../validators/variant';
import type { SetVariantImageInput } from '../validators/variant-image';

type VariantWithInventory = ProductVariant & { inventory: Inventory | null };
type ProductWithVariants = Product & { variants: VariantWithInventory[] };

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

  /**
   * Every live variant of the org, flattened one row per variant (product columns
   * repeated), for the bulk CSV export. Capped at PRODUCT_EXPORT_CAP — oldest
   * products first so the dropped tail (if any) is the newest, and logged on
   * overflow. Variant-less products produce no rows (no sellable leaf to export).
   */
  async listForExport(organizationId: string): Promise<ProductExportRow[]> {
    const variants = await prisma.productVariant.findMany({
      where: { organizationId, deletedAt: null, product: { deletedAt: null } },
      orderBy: [{ product: { createdAt: 'asc' } }, { createdAt: 'asc' }],
      take: PRODUCT_EXPORT_CAP + 1,
      include: {
        product: { select: { name: true, category: true, description: true } },
        inventory: { select: { availableStock: true } },
      },
    });

    if (variants.length > PRODUCT_EXPORT_CAP) {
      appLogger.warn('catalog.export.truncated', {
        organizationId,
        cap: PRODUCT_EXPORT_CAP,
        returned: PRODUCT_EXPORT_CAP,
      });
    }

    return variants.slice(0, PRODUCT_EXPORT_CAP).map((variant) => ({
      productName: variant.product.name,
      category: variant.product.category,
      description: variant.product.description,
      variantGroup: variant.variantGroup,
      variantName: variant.name,
      sku: variant.sku,
      barcode: variant.barcode,
      price: variant.price.toString(),
      cost: variant.cost?.toString() ?? null,
      stock: variant.inventory?.availableStock ?? 0,
    }));
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

  /**
   * Patch a live variant's core fields (name/group/barcode/price/cost) — the
   * bulk-import update path. SKU is the match key and is NOT changed here. Omitted
   * input fields are left unchanged (a price-only update won't clobber a barcode).
   */
  async updateVariantDetails(
    organizationId: string,
    variantId: string,
    input: UpdateVariantDetailsInput,
  ): Promise<ProductVariantItem> {
    const owned = await prisma.productVariant.findFirst({
      where: { id: variantId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!owned) throw CatalogError.notFound('Variant not found.');

    const updated = await prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.variantGroup !== undefined ? { variantGroup: input.variantGroup } : {}),
        ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.cost !== undefined ? { cost: input.cost } : {}),
      },
      include: { inventory: true },
    });

    appLogger.info('catalog.variant.details_updated', { organizationId, variantId });

    return mapVariant(updated);
  }

  /**
   * Map the given SKUs to their live variant + owning product (org-scoped, exact
   * SKU match = the unique-index identity). Used by the importer to decide
   * create-vs-update per row. Missing SKUs are simply absent from the map.
   */
  async findVariantsBySkus(
    organizationId: string,
    skus: string[],
  ): Promise<Map<string, { variantId: string; productId: string }>> {
    const unique = [...new Set(skus)];
    if (unique.length === 0) return new Map();

    const rows = await prisma.productVariant.findMany({
      where: { organizationId, deletedAt: null, sku: { in: unique } },
      select: { id: true, sku: true, productId: true },
    });

    return new Map(rows.map((row) => [row.sku, { variantId: row.id, productId: row.productId }]));
  }

  /**
   * Map a product name to the live product ids that bear it (exact match). The
   * importer groups new variant rows by product name: 1 match → add the variants
   * to it; 0 → create a new product; ≥2 → ambiguous (the importer flags the rows).
   */
  async findLiveProductIdsByName(
    organizationId: string,
    names: string[],
  ): Promise<Map<string, string[]>> {
    const unique = [...new Set(names)];
    if (unique.length === 0) return new Map();

    const rows = await prisma.product.findMany({
      where: { organizationId, deletedAt: null, name: { in: unique } },
      select: { id: true, name: true },
    });

    const map = new Map<string, string[]>();
    for (const row of rows) {
      const list = map.get(row.name) ?? [];
      list.push(row.id);
      map.set(row.name, list);
    }
    return map;
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
      select: { id: true, imageKey: true, imageSizeBytes: true },
    });
    if (!variant) throw CatalogError.notFound('Variant not found.');
    if (!storageService.ownsKey(input.imageKey, organizationId)) {
      throw CatalogError.validation('Invalid image reference.');
    }

    const newSize = BigInt(input.fileSizeBytes);
    const previousSize = variant.imageSizeBytes ?? 0n;

    // Persist the photo + book the net quota delta in one tx (mirrors completeRecording):
    // a fresh set adds the full size; a replace releases the old bytes and books the new.
    await prisma.$transaction(async (tx) => {
      await tx.productVariant.update({
        where: { id: variantId },
        data: { imageKey: input.imageKey, imageUrl: input.imageUrl, imageSizeBytes: newSize },
      });
      const delta = newSize - previousSize;
      if (delta !== 0n) {
        await tx.organization.update({
          where: { id: organizationId },
          data: { storageUsedBytes: { increment: delta } },
        });
      }
    });

    // Drop the replaced R2 object after the booking commits (best-effort).
    if (variant.imageKey && variant.imageKey !== input.imageKey) {
      await deleteStorageObject(variant.imageKey);
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
      select: { id: true, imageKey: true, imageSizeBytes: true },
    });
    if (!variant) throw CatalogError.notFound('Variant not found.');

    const previousSize = variant.imageSizeBytes ?? 0n;

    await prisma.$transaction(async (tx) => {
      await tx.productVariant.update({
        where: { id: variantId },
        data: { imageKey: null, imageUrl: null, imageSizeBytes: null },
      });
      if (previousSize > 0n) {
        await tx.organization.update({
          where: { id: organizationId },
          data: { storageUsedBytes: { decrement: previousSize } },
        });
      }
    });

    if (variant.imageKey) await deleteStorageObject(variant.imageKey);

    appLogger.info('catalog.variant.image.removed', { organizationId, productId, variantId });
    return this.getProductById(organizationId, productId);
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
      await bundleServerService.cascadeBundleComponentRemoval(
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
      await bundleServerService.cascadeBundleComponentRemoval(
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

    const taken = await takenSkus(
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
    if ((await takenSkus(organizationId, [sku])).has(sku)) throw CatalogError.duplicateSku(sku);

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
