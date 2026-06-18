import 'server-only';

import {
  buildPaginatedResult,
  prisma,
  type PaginatedResult,
  type TransactionClient,
} from '@falka/db';
import type { Prisma } from '@prisma/client';

import { appLogger } from '@/lib/logger';
import { auditService } from '@/modules/audit/services/audit.service';
import { storageService } from '@/modules/storage/services/storage.service';

import { CatalogError } from '../errors/catalog-errors';
import type {
  ArchivedBundleItem,
  BundleComponentLine,
  BundleDetail,
  BundleLabel,
  BundleListItem,
  BundleListSummary,
  BundleResolution,
} from '../types';
import { computeBuildableQty } from '../utils/bundle';
import { isUniqueConstraintError } from '../utils/prisma-errors';
import { takenSkus } from '../utils/sku';
import { deleteStorageObject } from '../utils/storage';
import { archivedSku, unarchiveSku } from '../utils/variants';
import type { CreateBundleInput, ListBundlesQuery, UpdateBundleInput } from '../validators/bundle';
import type { LabelVariantsQuery } from '../validators/label-variants';
import type { SetVariantImageInput } from '../validators/variant-image';

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
 * Owns the bundle/kit shortcut (`Bundle` / `BundleItem`). A bundle groups several
 * variants for buy/sell and holds no stock of its own — its "available" is computed
 * from its components' stock. Lives in the catalog module alongside the product/variant
 * master service; sale/PO explosion reaches it only through this service surface.
 */
export class BundleServerService {
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
    if ((await takenSkus(organizationId, [sku])).has(sku)) throw CatalogError.duplicateSku(sku);

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
      await deleteStorageObject(bundle.imageKey);
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
    if (bundle.imageKey) await deleteStorageObject(bundle.imageKey);

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

  /**
   * When variants are archived, drop them from every live bundle that lists them as
   * a component, then archive any such bundle left with no components (it can no
   * longer be built or sold). An archived bundle frees its SKU like a variant. Items
   * of already-archived bundles are left untouched so a restore keeps its composition.
   */
  async cascadeBundleComponentRemoval(
    tx: TransactionClient,
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
}

export const bundleServerService = new BundleServerService();
