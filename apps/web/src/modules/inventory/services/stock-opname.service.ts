import 'server-only';

import { buildPaginatedResult, prisma, type PaginatedResult } from '@falka/db';
import { enqueuePropagateInventoryStock } from '@falka/queue';
import type { Prisma } from '@prisma/client';

import { appLogger } from '@/lib/logger';
import { retryOnCodeCollision } from '@/lib/db-retry';

import { inventoryServerService } from './inventory-server.service';
import { StockOpnameError } from '../errors/stock-opname-errors';
import type {
  CountableVariant,
  OpnameScanResult,
  StockOpnameDetail,
  StockOpnameItemDetail,
  StockOpnameListItem,
} from '../types';
import type {
  CreateStockOpnameInput,
  ListStockOpnameQuery,
  SearchCountableVariantsQuery,
  UpsertOpnameItemInput,
} from '../validators/stock-opname';

const DETAIL_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      productVariant: {
        select: { variantGroup: true, imageUrl: true, product: { select: { name: true } } },
      },
    },
  },
} satisfies Prisma.StockOpnameInclude;

type StockOpnameRow = Prisma.StockOpnameGetPayload<{ include: typeof DETAIL_INCLUDE }>;

function mapDetail(row: StockOpnameRow): StockOpnameDetail {
  const items: StockOpnameItemDetail[] = row.items.map((item) => ({
    id: item.id,
    variantId: item.productVariantId,
    sku: item.sku,
    name: item.name,
    productName: item.productVariant.product.name,
    variantGroup: item.productVariant.variantGroup,
    imageUrl: item.productVariant.imageUrl,
    systemQuantity: item.systemQuantity,
    countedQuantity: item.countedQuantity,
    variance: item.variance,
  }));

  let varianceItemCount = 0;
  let shortageUnits = 0;
  let surplusUnits = 0;
  for (const item of items) {
    if (item.variance !== 0) varianceItemCount += 1;
    if (item.variance < 0) shortageUnits += -item.variance;
    else surplusUnits += item.variance;
  }

  return {
    id: row.id,
    code: row.code,
    status: row.status,
    note: row.note,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    summary: {
      itemCount: items.length,
      varianceItemCount,
      shortageUnits,
      surplusUnits,
      netUnits: surplusUnits - shortageUnits,
    },
    items,
  };
}

function mapCountable(variant: {
  id: string;
  sku: string;
  name: string;
  variantGroup: string | null;
  imageUrl: string | null;
  product: { name: string };
  inventory: { availableStock: number } | null;
}): CountableVariant {
  return {
    variantId: variant.id,
    sku: variant.sku,
    name: variant.name,
    productName: variant.product.name,
    variantGroup: variant.variantGroup,
    systemQuantity: variant.inventory?.availableStock ?? 0,
    imageUrl: variant.imageUrl,
  };
}

const COUNTABLE_SELECT = {
  id: true,
  sku: true,
  name: true,
  variantGroup: true,
  imageUrl: true,
  product: { select: { name: true } },
  inventory: { select: { availableStock: true } },
} satisfies Prisma.ProductVariantSelect;

/**
 * Stock opname (cycle count): a session where the operator records the physically
 * counted quantity per variant against the system's number. Posting (COMPLETED)
 * writes each line's variance to the append-only ledger as a RECONCILE row and
 * corrects the Inventory cache — all stock writes go through the inventory service.
 * Read of catalog variants is read-only. Queries are scoped by `organizationId`;
 * `StockOpname.userId` records the creating ACTOR and the RECONCILE ledger rows
 * record the posting ACTOR.
 */
export class StockOpnameService {
  /** Variants to add to a count — matched by SKU/name, with the current system qty. Paginated. */
  async searchCountableVariants(
    organizationId: string,
    query: SearchCountableVariantsQuery,
  ): Promise<PaginatedResult<CountableVariant>> {
    const term = query.q.trim();
    const where: Prisma.ProductVariantWhereInput = {
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

    const [variants, total] = await Promise.all([
      prisma.productVariant.findMany({
        where,
        select: COUNTABLE_SELECT,
        orderBy: [{ product: { name: 'asc' } }, { name: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.productVariant.count({ where }),
    ]);

    return buildPaginatedResult(variants.map(mapCountable), total, query.page, query.pageSize);
  }

  /** Resolve a scanned/typed code to one variant to count (barcode then SKU, case-insensitive). */
  async resolveCountableVariant(
    organizationId: string,
    code: string,
  ): Promise<CountableVariant | null> {
    const term = code.trim();
    if (!term) return null;

    const base = { organizationId, deletedAt: null } as const;
    const variant =
      (await prisma.productVariant.findFirst({
        where: { ...base, barcode: { equals: term, mode: 'insensitive' } },
        select: COUNTABLE_SELECT,
      })) ??
      (await prisma.productVariant.findFirst({
        where: { ...base, sku: { equals: term, mode: 'insensitive' } },
        select: COUNTABLE_SELECT,
      }));

    return variant ? mapCountable(variant) : null;
  }

  async listOpnames(
    organizationId: string,
    query: ListStockOpnameQuery,
  ): Promise<PaginatedResult<StockOpnameListItem>> {
    const where: Prisma.StockOpnameWhereInput = {
      organizationId,
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { note: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.stockOpname.findMany({
        where,
        include: { _count: { select: { items: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.stockOpname.count({ where }),
    ]);

    const items: StockOpnameListItem[] = rows.map((row) => ({
      id: row.id,
      code: row.code,
      status: row.status,
      note: row.note,
      itemCount: row._count.items,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    }));

    return buildPaginatedResult(items, total, query.page, query.pageSize);
  }

  async getOpname(organizationId: string, id: string): Promise<StockOpnameDetail> {
    const row = await prisma.stockOpname.findFirst({
      where: { id, organizationId },
      include: DETAIL_INCLUDE,
    });
    if (!row) throw StockOpnameError.notFound();
    return mapDetail(row);
  }

  /** Start a new (empty) DRAFT session with a per-organization code (OP00001). */
  async createOpname(
    organizationId: string,
    actorUserId: string,
    input: CreateStockOpnameInput,
  ): Promise<StockOpnameDetail> {
    const created = await retryOnCodeCollision(() =>
      prisma.$transaction(async (tx) => {
        const count = await tx.stockOpname.count({ where: { organizationId } });
        const code = `OP${(count + 1).toString().padStart(5, '0')}`;
        return tx.stockOpname.create({
          data: { userId: actorUserId, organizationId, code, note: input.note ?? null },
        });
      }),
    );

    appLogger.info('inventory.opname.created', {
      organizationId,
      actorUserId,
      opnameId: created.id,
      code: created.code,
    });
    return this.getOpname(organizationId, created.id);
  }

  /**
   * Add or update a counted line. The system quantity is snapshotted from live
   * inventory ONLY on first add — later edits keep the session's baseline, so the
   * variance you saw while counting is the one that gets posted. DRAFT only.
   */
  async upsertItem(
    organizationId: string,
    id: string,
    input: UpsertOpnameItemInput,
  ): Promise<StockOpnameDetail> {
    const opname = await prisma.stockOpname.findFirst({
      where: { id, organizationId },
      select: { id: true, status: true },
    });
    if (!opname) throw StockOpnameError.notFound();
    if (opname.status !== 'DRAFT') throw StockOpnameError.validation('Opname ini sudah ditutup.');

    const variant = await prisma.productVariant.findFirst({
      where: { id: input.variantId, organizationId, deletedAt: null },
      select: { id: true, sku: true, name: true, inventory: { select: { availableStock: true } } },
    });
    if (!variant) throw StockOpnameError.validation('Varian tidak ditemukan.');

    const existing = await prisma.stockOpnameItem.findUnique({
      where: {
        stockOpnameId_productVariantId: { stockOpnameId: id, productVariantId: input.variantId },
      },
      select: { id: true, systemQuantity: true },
    });

    const systemQuantity = existing?.systemQuantity ?? variant.inventory?.availableStock ?? 0;
    const variance = input.countedQuantity - systemQuantity;

    if (existing) {
      await prisma.stockOpnameItem.update({
        where: { id: existing.id },
        data: { countedQuantity: input.countedQuantity, variance },
      });
    } else {
      await prisma.stockOpnameItem.create({
        data: {
          stockOpnameId: id,
          productVariantId: variant.id,
          sku: variant.sku,
          name: variant.name,
          systemQuantity,
          countedQuantity: input.countedQuantity,
          variance,
        },
      });
    }

    return this.getOpname(organizationId, id);
  }

  /**
   * Scan-to-count: resolve a barcode/SKU and add +1 to that variant's counted qty
   * (creating the line at 1 on first scan, snapshotting the system qty then). Tally
   * each physical unit. DRAFT only; returns `matched: null` when nothing resolves so
   * the caller can buzz an error.
   */
  async scanCountItem(organizationId: string, id: string, code: string): Promise<OpnameScanResult> {
    const opname = await prisma.stockOpname.findFirst({
      where: { id, organizationId },
      select: { id: true, status: true },
    });
    if (!opname) throw StockOpnameError.notFound();
    if (opname.status !== 'DRAFT') throw StockOpnameError.validation('Opname ini sudah ditutup.');

    const variant = await this.resolveCountableVariant(organizationId, code);
    if (!variant) return { matched: null, detail: null };

    const counted = await prisma.$transaction(async (tx) => {
      const existing = await tx.stockOpnameItem.findUnique({
        where: {
          stockOpnameId_productVariantId: {
            stockOpnameId: id,
            productVariantId: variant.variantId,
          },
        },
        select: { id: true, systemQuantity: true, countedQuantity: true },
      });

      if (existing) {
        const newCounted = existing.countedQuantity + 1;
        await tx.stockOpnameItem.update({
          where: { id: existing.id },
          data: { countedQuantity: newCounted, variance: newCounted - existing.systemQuantity },
        });
        return newCounted;
      }

      await tx.stockOpnameItem.create({
        data: {
          stockOpnameId: id,
          productVariantId: variant.variantId,
          sku: variant.sku,
          name: variant.name,
          systemQuantity: variant.systemQuantity,
          countedQuantity: 1,
          variance: 1 - variant.systemQuantity,
        },
      });
      return 1;
    });

    const detail = await this.getOpname(organizationId, id);
    return {
      matched: {
        sku: variant.sku,
        name: variant.name,
        productName: variant.productName,
        variantGroup: variant.variantGroup,
        countedQuantity: counted,
      },
      detail,
    };
  }

  /** Remove a counted line (DRAFT only). A wrong/stale itemId is a no-op. */
  async removeItem(organizationId: string, id: string, itemId: string): Promise<StockOpnameDetail> {
    const opname = await prisma.stockOpname.findFirst({
      where: { id, organizationId },
      select: { id: true, status: true },
    });
    if (!opname) throw StockOpnameError.notFound();
    if (opname.status !== 'DRAFT') throw StockOpnameError.validation('Opname ini sudah ditutup.');

    await prisma.stockOpnameItem.deleteMany({ where: { id: itemId, stockOpnameId: id } });
    return this.getOpname(organizationId, id);
  }

  /**
   * Post the count (DRAFT → COMPLETED): for every line with a variance, shift
   * available by that variance and write a RECONCILE ledger row (actor = the
   * posting user), in one tx. Then propagate the corrected stock to the channels.
   * No-variance lines write nothing.
   */
  async completeOpname(
    organizationId: string,
    actorUserId: string,
    id: string,
  ): Promise<StockOpnameDetail> {
    const opname = await prisma.stockOpname.findFirst({
      where: { id, organizationId },
      include: { items: true },
    });
    if (!opname) throw StockOpnameError.notFound();
    if (opname.status !== 'DRAFT') {
      throw StockOpnameError.validation('Opname ini sudah diposting atau dibatalkan.');
    }
    if (opname.items.length === 0) {
      throw StockOpnameError.validation('Tambahkan minimal satu item sebelum posting.');
    }

    const affected: { variantId: string; availableStock: number; eventId: string }[] = [];

    await prisma.$transaction(async (tx) => {
      for (const item of opname.items) {
        if (item.variance === 0) continue;
        const result = await inventoryServerService.applyReconcileTx(tx, {
          organizationId,
          actorUserId,
          variantId: item.productVariantId,
          delta: item.variance,
          note: `Opname ${opname.code}`,
        });
        affected.push({
          variantId: item.productVariantId,
          availableStock: result.availableStock,
          eventId: result.ledgerId,
        });
      }

      await tx.stockOpname.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    });

    appLogger.info('inventory.opname.completed', {
      organizationId,
      actorUserId,
      opnameId: id,
      posted: affected.length,
    });
    await this.propagateAffected(organizationId, actorUserId, affected);
    return this.getOpname(organizationId, id);
  }

  /** Cancel a not-yet-posted count (DRAFT → CANCELLED). Nothing is written to stock. */
  async cancelOpname(organizationId: string, id: string): Promise<StockOpnameDetail> {
    const opname = await prisma.stockOpname.findFirst({
      where: { id, organizationId },
      select: { id: true, status: true },
    });
    if (!opname) throw StockOpnameError.notFound();
    if (opname.status !== 'DRAFT') {
      throw StockOpnameError.validation('Hanya opname draft yang bisa dibatalkan.');
    }

    await prisma.stockOpname.update({ where: { id }, data: { status: 'CANCELLED' } });
    appLogger.info('inventory.opname.cancelled', { organizationId, opnameId: id });
    return this.getOpname(organizationId, id);
  }

  /** Best-effort: push each corrected variant's new available stock to all channels. */
  private async propagateAffected(
    organizationId: string,
    actorUserId: string,
    entries: { variantId: string; availableStock: number; eventId: string }[],
  ): Promise<void> {
    for (const entry of entries) {
      try {
        const syncEnabledCount = await prisma.marketplaceProductMapping.count({
          where: { productVariantId: entry.variantId, organizationId, syncEnabled: true },
        });
        if (syncEnabledCount === 0) continue;

        await enqueuePropagateInventoryStock({
          organizationId,
          actorUserId,
          variantId: entry.variantId,
          availableStock: entry.availableStock,
          eventId: entry.eventId,
        });
      } catch (error) {
        appLogger.warn('inventory.opname.propagate.enqueue_failed', {
          organizationId,
          variantId: entry.variantId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

export const stockOpnameService = new StockOpnameService();
