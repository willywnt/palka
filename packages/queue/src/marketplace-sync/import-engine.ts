import { getServerEnv } from '@palka/config/env.server';
import { prisma } from '@palka/db';
import {
  buildVariantSkuIndex,
  createLazadaClient,
  createShopeeClient,
  fetchLazadaListingsPage,
  fetchShopeeListingsPage,
  isTransientLazadaError,
  isTransientShopeeError,
  LazadaApiError,
  matchSku,
  ShopeeApiError,
  type LazadaListingItem,
  type ShopeeListingItem,
} from '@palka/marketplace-providers';
import { decrypt } from '@palka/utils/crypto';
import { logger } from '@palka/utils/logger';
import type { MarketplaceConnection, MarketplaceProvider, Prisma } from '@prisma/client';

import { acquireProviderToken, penalizeProvider } from './provider-rate-limit-redis.js';

// Lazada GetProducts caps `limit` at 50 (100+ → E019 Invalid Limit on a live shop).
const LAZADA_IMPORT_PAGE_LIMIT = 50;
// Shopee get_item_list caps page_size at 100.
const SHOPEE_IMPORT_PAGE_LIMIT = 100;
const LAZADA_BASE_URL = 'https://api.lazada.co.id/rest';
const SHOPEE_BASE_URL = 'https://partner.shopeemobile.com';
/** Re-pull overlap that absorbs clock skew + provider eventual consistency (upserts dedupe). */
const OVERLAP_MS = 10 * 60 * 1000;

type ImportContext = {
  organizationId: string;
  actorUserId: string;
  connectionId: string;
  provider: MarketplaceProvider;
};

export type ImportEngineResult = {
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
  importedRows: number;
  autoMappedCount: number;
};

/** One imported listing normalized across providers (the externalVariant grain). */
type NormalizedImportListing = {
  externalProductId: string;
  externalVariantId: string;
  externalSku: string | null;
  externalProductName: string;
  externalVariantName: string | null;
  stock: number;
  status: string;
  /** Per-location sellable warehouse codes (for the connection's known-warehouses set). */
  warehouseCodes: string[];
  raw: Record<string, unknown>;
};

const mapLazadaItem = (item: LazadaListingItem): NormalizedImportListing => ({
  externalProductId: item.itemId,
  externalVariantId: item.skuId,
  externalSku: item.sellerSku,
  externalProductName: item.productName,
  externalVariantName: item.variantName,
  stock: item.quantity,
  status: item.status,
  warehouseCodes: item.warehouses.map((wh) => wh.code),
  raw: item.raw,
});

const mapShopeeItem = (item: ShopeeListingItem): NormalizedImportListing => ({
  externalProductId: item.itemId,
  externalVariantId: item.modelId,
  externalSku: item.modelSku,
  externalProductName: item.productName,
  externalVariantName: item.variantName,
  stock: item.quantity,
  status: item.status,
  warehouseCodes: item.warehouses.map((wh) => wh.code),
  raw: item.raw,
});

/** The upsert for ONE listing — built (not awaited) so a whole page can run in one transaction. */
function buildListingUpsert(ctx: ImportContext, item: NormalizedImportListing, now: Date) {
  return prisma.marketplaceProduct.upsert({
    where: {
      marketplaceConnectionId_externalProductId_externalVariantId: {
        marketplaceConnectionId: ctx.connectionId,
        externalProductId: item.externalProductId,
        externalVariantId: item.externalVariantId,
      },
    },
    create: {
      userId: ctx.actorUserId,
      organizationId: ctx.organizationId,
      marketplaceConnectionId: ctx.connectionId,
      provider: ctx.provider,
      externalProductId: item.externalProductId,
      externalVariantId: item.externalVariantId,
      externalSku: item.externalSku,
      externalProductName: item.externalProductName,
      externalVariantName: item.externalVariantName,
      stock: item.stock,
      status: item.status,
      rawPayload: item.raw as Prisma.InputJsonValue,
      lastImportedAt: now,
    },
    update: {
      externalSku: item.externalSku,
      externalProductName: item.externalProductName,
      externalVariantName: item.externalVariantName,
      stock: item.stock,
      status: item.status,
      rawPayload: item.raw as Prisma.InputJsonValue,
      lastImportedAt: now,
      deletedAt: null,
    },
  });
}

/**
 * Upsert one page of listings into MarketplaceProduct (one row per SKU). FAST PATH: the whole page
 * in ONE batched transaction (cuts client↔engine round-trips ~Nx). If the batch throws (e.g. a
 * malformed row), FALL BACK to per-row upserts so a single bad row doesn't sink the page — the rest
 * still land. (A real DB outage instead surfaces on the next checkpoint write → BullMQ retry.)
 * Returns the write count + warehouse codes.
 */
async function upsertPage(
  ctx: ImportContext,
  items: NormalizedImportListing[],
  now: Date,
): Promise<{ imported: number; errors: number; warehouseCodes: string[] }> {
  const warehouseCodes = new Set<string>();
  for (const item of items) for (const code of item.warehouseCodes) warehouseCodes.add(code);
  if (items.length === 0) return { imported: 0, errors: 0, warehouseCodes: [] };

  try {
    await prisma.$transaction(items.map((item) => buildListingUpsert(ctx, item, now)));
    return { imported: items.length, errors: 0, warehouseCodes: [...warehouseCodes] };
  } catch (batchError) {
    logger.warn('marketplace.import.batch_fallback', {
      connectionId: ctx.connectionId,
      pageSize: items.length,
      error: batchError instanceof Error ? batchError.message : String(batchError),
    });
  }

  let imported = 0;
  let errors = 0;
  for (const item of items) {
    try {
      await buildListingUpsert(ctx, item, now);
      imported += 1;
    } catch (error) {
      errors += 1;
      logger.warn('marketplace.import.listing_skipped', {
        connectionId: ctx.connectionId,
        externalProductId: item.externalProductId,
        externalVariantId: item.externalVariantId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // The ENTIRE page failed in the fallback too — almost certainly an infra blip (deadlock / pool /
  // tx timeout), not 50 simultaneously-bad rows. Surface it so the engine retries from the checkpoint
  // instead of counting it as skippable and advancing past unpersisted listings.
  if (imported === 0 && items.length > 0) {
    throw new Error(`marketplace import: all ${items.length} listings in a page failed to persist`);
  }

  return { imported, errors, warehouseCodes: [...warehouseCodes] };
}

/**
 * Auto-map still-unmapped imported listings to internal variants by NORMALIZED SKU (EXACT → MAPPED
 * + sync-ready; NORMALIZED → NEEDS_REVIEW, sync-off). Runs once at the end (a full scan over the
 * org's variants). Mirrors the web import service — duplication is kept on purpose to honor the
 * server-only/worker boundary (CLAUDE.md CONFLICT RULE); the matching CORE is the shared sku-match.
 */
async function autoMapImported(ctx: ImportContext): Promise<number> {
  const unmapped = await prisma.marketplaceProduct.findMany({
    where: {
      marketplaceConnectionId: ctx.connectionId,
      organizationId: ctx.organizationId,
      deletedAt: null,
      mapping: { is: null },
      externalSku: { not: null },
    },
    select: { id: true, externalSku: true },
  });
  if (unmapped.length === 0) return 0;

  const variants = await prisma.productVariant.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null },
    select: { id: true, sku: true },
  });
  const index = buildVariantSkuIndex(variants);

  let mapped = 0;
  for (const product of unmapped) {
    if (!product.externalSku) continue;
    const match = matchSku(product.externalSku, index);
    if (!match) continue;
    const exact = match.quality === 'EXACT';
    try {
      await prisma.marketplaceProductMapping.create({
        data: {
          userId: ctx.actorUserId,
          organizationId: ctx.organizationId,
          marketplaceConnectionId: ctx.connectionId,
          marketplaceProductId: product.id,
          productVariantId: match.variantId,
          provider: ctx.provider,
          mappingStatus: exact ? 'MAPPED' : 'NEEDS_REVIEW',
          autoMapped: true,
          mappingConfidence: exact ? 1 : 0.9,
          syncEnabled: exact,
        },
      });
      mapped += 1;
    } catch {
      // marketplaceProductId is unique on the mapping — a race lost; ignore.
    }
  }
  return mapped;
}

function mergeWarehouseCodes(existing: string[], fresh: Set<string>): string[] {
  return [...new Set([...existing, ...fresh])].sort();
}

type ImportPage = {
  items: NormalizedImportListing[];
  total: number | undefined;
  productCount: number;
};
type ImportPager = { pageLimit: number; fetchPage: (offset: number) => Promise<ImportPage> };

/**
 * Provider-specific paged listing fetcher, normalized to one shape for the generic import loop. Each
 * fetchPage paces EVERY provider call through the shared Redis limiter — Lazada: one /products/get
 * per page; Shopee: get_item_list + per-item base-info/model-list, all via `beforeCall`. Lazada
 * supports the incremental `updatedAfter`; Shopee's get_item_list has no update filter → always full.
 */
function createImportPager(
  connection: MarketplaceConnection,
  accessToken: string,
  updatedAfter: Date | undefined,
): ImportPager {
  const env = getServerEnv();

  if (connection.provider === 'SHOPEE') {
    const client = createShopeeClient({
      partnerId: env.SHOPEE_PARTNER_ID ?? '',
      partnerKey: env.SHOPEE_PARTNER_KEY ?? '',
      baseUrl: env.SHOPEE_API_BASE_URL ?? SHOPEE_BASE_URL,
    });
    return {
      pageLimit: SHOPEE_IMPORT_PAGE_LIMIT,
      fetchPage: async (offset) => {
        const page = await fetchShopeeListingsPage(client, {
          accessToken,
          shopId: connection.shopId,
          offset,
          pageSize: SHOPEE_IMPORT_PAGE_LIMIT,
          beforeCall: () => acquireProviderToken('SHOPEE', connection.shopId),
        });
        return {
          items: page.items.map(mapShopeeItem),
          total: page.total,
          productCount: page.productCount,
        };
      },
    };
  }

  const client = createLazadaClient({
    appKey: env.LAZADA_APP_KEY ?? '',
    appSecret: env.LAZADA_APP_SECRET ?? '',
    baseUrl: env.LAZADA_API_BASE_URL ?? LAZADA_BASE_URL,
  });
  return {
    pageLimit: LAZADA_IMPORT_PAGE_LIMIT,
    fetchPage: async (offset) => {
      await acquireProviderToken('LAZADA', connection.shopId);
      const page = await fetchLazadaListingsPage(client, {
        accessToken,
        offset,
        limit: LAZADA_IMPORT_PAGE_LIMIT,
        updatedAfter,
      });
      return {
        items: page.items.map(mapLazadaItem),
        total: page.total,
        productCount: page.productCount,
      };
    },
  };
}

/** Classify a thrown import error: a provider API error (+ whether it's a transient throttle), or a
 *  network/infra error (apiError=false → retryable). Drives the retry-vs-fail + penalize decision. */
function classifyImportError(error: unknown): {
  apiError: boolean;
  transient: boolean;
  code: string | null;
} {
  if (error instanceof LazadaApiError) {
    return {
      apiError: true,
      transient: isTransientLazadaError(error.code, error.providerMessage),
      code: error.code,
    };
  }
  if (error instanceof ShopeeApiError) {
    return {
      apiError: true,
      transient: isTransientShopeeError(error.code, error.providerMessage),
      code: error.code,
    };
  }
  return { apiError: false, transient: false, code: null };
}

/**
 * Best-effort in-app notification when an import reaches a terminal state — so the actor who left
 * the page sees the outcome on their next visit. Targeted to the actor, MARKETPLACE category,
 * deduped per import run. Never fails the job.
 */
async function notifyImportFinished(
  ctx: ImportContext,
  importJobId: string,
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED',
  stats: { importedRows: number; autoMappedCount: number; lastError: string | null },
): Promise<void> {
  const severity = status === 'FAILED' ? 'URGENT' : status === 'PARTIAL' ? 'WARNING' : 'SUCCESS';
  const title =
    status === 'FAILED'
      ? 'Impor listing gagal'
      : status === 'PARTIAL'
        ? 'Impor listing selesai sebagian'
        : 'Impor listing selesai';
  const body =
    status === 'FAILED'
      ? (stats.lastError ?? 'Terjadi kesalahan saat impor.')
      : `${stats.importedRows} listing diimpor, ${stats.autoMappedCount} otomatis terkait.`;

  // One notification PER CONNECTION = its LATEST import state, so a failed→retried→succeeded run
  // supersedes IN PLACE instead of stacking a stale failure above the success in the tray. Refresh
  // the row, bump it to newest (createdAt), and re-surface it as unread (a new terminal state).
  const dedupeKey = `marketplace-import-${ctx.connectionId}`;
  const href = `/dashboard/marketplace/${ctx.connectionId}`;

  try {
    const row = await prisma.notification.upsert({
      where: { organizationId_dedupeKey: { organizationId: ctx.organizationId, dedupeKey } },
      create: {
        organizationId: ctx.organizationId,
        dedupeKey,
        recipientUserId: ctx.actorUserId,
        actorUserId: ctx.actorUserId,
        type: 'SYSTEM',
        category: 'MARKETPLACE',
        severity,
        title,
        body,
        href,
        entityType: 'marketplaceConnection',
        entityId: ctx.connectionId,
      },
      update: {
        recipientUserId: ctx.actorUserId,
        actorUserId: ctx.actorUserId,
        type: 'SYSTEM',
        category: 'MARKETPLACE',
        severity,
        title,
        body,
        href,
        entityType: 'marketplaceConnection',
        entityId: ctx.connectionId,
        createdAt: new Date(),
      },
      select: { id: true },
    });
    // No-op on a fresh create; on a supersede it clears prior read state so the new state shows unread.
    await prisma.notificationRead.deleteMany({ where: { notificationId: row.id } });
  } catch (error) {
    logger.warn('marketplace.import.notify_failed', {
      importJobId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Run (or RESUME) a marketplace catalog import as a background job. Pages the provider with the
 * shared Redis rate limiter, streams each page to MarketplaceProduct, checkpoints the offset on the
 * MarketplaceImportJob row (so a BullMQ retry resumes instead of restarting), auto-maps once at the
 * end, and finalizes the job status. On a persistent throttle it penalizes the shop + throws so
 * BullMQ retries from the checkpoint (until the final attempt, which keeps the partial result).
 * Real adapters (LAZADA + SHOPEE) run here; stub/unconfigured providers import synchronously on the
 * request path instead (see the import-job service).
 */
export async function runMarketplaceImport(
  importJobId: string,
  opts: { attemptNumber: number; maxAttempts: number },
): Promise<ImportEngineResult> {
  const job = await prisma.marketplaceImportJob.findUnique({
    where: { id: importJobId },
    include: { connection: true },
  });
  if (!job) {
    logger.warn('marketplace.import.job_not_found', { importJobId });
    return { status: 'FAILED', importedRows: 0, autoMappedCount: 0 };
  }
  if (job.status === 'COMPLETED') {
    return {
      status: 'COMPLETED',
      importedRows: job.importedRows,
      autoMappedCount: job.autoMappedCount,
    };
  }

  const { connection } = job;
  const ctx: ImportContext = {
    organizationId: job.organizationId,
    actorUserId: job.actorUserId,
    connectionId: job.connectionId,
    provider: connection.provider,
  };

  // Stable across BullMQ retries (startedAt is set once) — also the value the incremental
  // watermark advances to on a complete run, so updates DURING the import aren't skipped next time.
  const runStartedAt = job.startedAt ?? new Date();
  await prisma.marketplaceImportJob.update({
    where: { id: importJobId },
    data: { status: 'PROCESSING', startedAt: runStartedAt, lastError: null },
  });

  if (connection.provider !== 'LAZADA' && connection.provider !== 'SHOPEE') {
    await prisma.marketplaceImportJob.update({
      where: { id: importJobId },
      data: {
        status: 'FAILED',
        lastError: `Background import not supported for ${connection.provider}.`,
        completedAt: new Date(),
      },
    });
    return { status: 'FAILED', importedRows: 0, autoMappedCount: 0 };
  }

  let accessToken = '';
  try {
    accessToken = decrypt(
      connection.encryptedAccessToken,
      getServerEnv().MARKETPLACE_ENCRYPTION_SECRET,
    );
  } catch {
    // Stub/seed connections store a non-cipher placeholder; a real call surfaces its own auth error.
  }

  const now = new Date();
  // Incremental: pull only listings changed since the last complete import (minus an overlap). A
  // full re-pull (or a never-imported connection) omits the filter and pages the whole catalog.
  const updatedAfter =
    !job.full && connection.listingsSyncedThrough
      ? new Date(connection.listingsSyncedThrough.getTime() - OVERLAP_MS)
      : undefined;
  const pager = createImportPager(connection, accessToken, updatedAfter);
  let offset = job.offsetCheckpoint;
  let importedRows = job.importedRows;
  let processedProducts = job.processedProducts;
  let errorCount = job.errorCount;
  let total: number | undefined = job.totalProducts ?? undefined;
  const warehouseCodes = new Set<string>();

  try {
    for (;;) {
      const page = await pager.fetchPage(offset);
      if (typeof page.total === 'number') total = page.total;

      const result = await upsertPage(ctx, page.items, now);
      importedRows += result.imported;
      errorCount += result.errors;
      for (const code of result.warehouseCodes) warehouseCodes.add(code);
      processedProducts += page.productCount;
      offset += pager.pageLimit;

      await prisma.marketplaceImportJob.update({
        where: { id: importJobId },
        data: {
          processedProducts,
          importedRows,
          errorCount,
          totalProducts: total ?? null,
          offsetCheckpoint: offset,
        },
      });

      if (page.productCount < pager.pageLimit) break;
      if (total !== undefined && offset >= total) break;
    }
  } catch (error) {
    const { apiError, transient, code } = classifyImportError(error);
    // Resume from the checkpoint for BOTH a sustained provider throttle AND any infra/network blip
    // (fetch timeout, 5xx, ECONNRESET, a DB/Redis hiccup) — those surface as plain Errors, not a
    // provider ApiError. Only a NON-transient provider error (e.g. auth/permission) is permanent.
    const retryable = transient || !apiError;
    const message = error instanceof Error ? error.message : String(error);

    if (transient) await penalizeProvider(connection.provider, connection.shopId);

    if (retryable && opts.attemptNumber < opts.maxAttempts) {
      const lastError = `${transient ? `${connection.provider} throttled (code ${code})` : `Import error (${message})`}; resuming from offset ${offset}.`;
      await prisma.marketplaceImportJob.update({
        where: { id: importJobId },
        data: { lastError },
      });
      throw error; // let BullMQ retry — runMarketplaceImport resumes from offsetCheckpoint
    }

    // Final attempt, or a permanent provider error: keep any partial progress (don't advance the
    // watermark — PARTIAL/FAILED never do), surface the failure, notify.
    const status = importedRows > 0 ? 'PARTIAL' : 'FAILED';
    const lastError = transient ? `${connection.provider} throttled (code ${code}).` : message;
    await prisma.marketplaceImportJob.update({
      where: { id: importJobId },
      data: { status, lastError, completedAt: new Date() },
    });
    logger.warn('marketplace.import.failed', {
      importJobId,
      connectionId: connection.id,
      error: lastError,
    });
    await notifyImportFinished(ctx, importJobId, status, {
      importedRows,
      autoMappedCount: 0,
      lastError,
    });
    return { status, importedRows, autoMappedCount: 0 };
  }

  // Every paged row failed to persist (a DB-layer problem, not a provider one) — don't report
  // success or advance the watermark; surface FAILED so the listings are retried, not skipped.
  if (importedRows === 0 && errorCount > 0) {
    const lastError = `${errorCount} listing gagal disimpan.`;
    await prisma.marketplaceImportJob.update({
      where: { id: importJobId },
      data: { status: 'FAILED', lastError, completedAt: new Date() },
    });
    await notifyImportFinished(ctx, importJobId, 'FAILED', {
      importedRows: 0,
      autoMappedCount: 0,
      lastError,
    });
    return { status: 'FAILED', importedRows: 0, autoMappedCount: 0 };
  }

  // Advance the incremental watermark ONLY when the run actually covered the whole window. A short
  // count (a mutating catalog shrank the filtered set under the offset cursor) leaves it put so the
  // next incremental re-pulls the un-covered tail instead of skipping it.
  // Also require a CLEAN run (no per-row skips): a counted error means a listing didn't persist, so
  // hold the watermark and let the next incremental re-cover it (idempotent upsert re-lands it).
  const reachedWholeWindow =
    (total === undefined || processedProducts >= total) && errorCount === 0;
  const autoMappedCount = await autoMapImported(ctx);
  await prisma.marketplaceConnection.update({
    where: { id: connection.id },
    data: {
      lastImportedAt: now,
      ...(reachedWholeWindow ? { listingsSyncedThrough: runStartedAt } : {}),
      ...(warehouseCodes.size > 0
        ? {
            knownWarehouseCodes: mergeWarehouseCodes(
              connection.knownWarehouseCodes,
              warehouseCodes,
            ),
          }
        : {}),
    },
  });
  await prisma.marketplaceImportJob.update({
    where: { id: importJobId },
    data: { status: 'COMPLETED', autoMappedCount, completedAt: new Date(), offsetCheckpoint: 0 },
  });
  logger.info('marketplace.import.completed', {
    importJobId,
    connectionId: connection.id,
    importedRows,
    autoMappedCount,
    totalProducts: total,
  });
  await notifyImportFinished(ctx, importJobId, 'COMPLETED', {
    importedRows,
    autoMappedCount,
    lastError: null,
  });
  return { status: 'COMPLETED', importedRows, autoMappedCount };
}
