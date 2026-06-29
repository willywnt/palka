import { getServerEnv } from '@palka/config/env.server';
import { prisma } from '@palka/db';
import {
  buildVariantSkuIndex,
  createLazadaClient,
  fetchLazadaListingsPage,
  isTransientLazadaError,
  LazadaApiError,
  matchSku,
  type LazadaClient,
  type LazadaListingItem,
} from '@palka/marketplace-providers';
import { decrypt } from '@palka/utils/crypto';
import { logger } from '@palka/utils/logger';
import type { MarketplaceProvider, Prisma } from '@prisma/client';

import { acquireProviderToken, penalizeProvider } from './provider-rate-limit-redis.js';

const IMPORT_PAGE_LIMIT = 100;
const LAZADA_BASE_URL = 'https://api.lazada.co.id/rest';

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

/** Upsert one page of listings into MarketplaceProduct (one row per SKU). A malformed row is
 *  skipped (counted) so the rest of the page still lands. Returns the write count + warehouse codes. */
async function upsertPage(
  ctx: ImportContext,
  items: LazadaListingItem[],
  now: Date,
): Promise<{ imported: number; errors: number; warehouseCodes: string[] }> {
  let imported = 0;
  let errors = 0;
  const warehouseCodes = new Set<string>();

  for (const item of items) {
    for (const wh of item.warehouses) warehouseCodes.add(wh.code);
    try {
      await prisma.marketplaceProduct.upsert({
        where: {
          marketplaceConnectionId_externalProductId_externalVariantId: {
            marketplaceConnectionId: ctx.connectionId,
            externalProductId: item.itemId,
            externalVariantId: item.skuId,
          },
        },
        create: {
          userId: ctx.actorUserId,
          organizationId: ctx.organizationId,
          marketplaceConnectionId: ctx.connectionId,
          provider: ctx.provider,
          externalProductId: item.itemId,
          externalVariantId: item.skuId,
          externalSku: item.sellerSku,
          externalProductName: item.productName,
          externalVariantName: item.variantName,
          stock: item.quantity,
          status: item.status,
          rawPayload: item.raw as Prisma.InputJsonValue,
          lastImportedAt: now,
        },
        update: {
          externalSku: item.sellerSku,
          externalProductName: item.productName,
          externalVariantName: item.variantName,
          stock: item.quantity,
          status: item.status,
          rawPayload: item.raw as Prisma.InputJsonValue,
          lastImportedAt: now,
          deletedAt: null,
        },
      });
      imported += 1;
    } catch (error) {
      errors += 1;
      logger.warn('marketplace.import.listing_skipped', {
        connectionId: ctx.connectionId,
        externalProductId: item.itemId,
        externalVariantId: item.skuId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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

/**
 * Run (or RESUME) a marketplace catalog import as a background job. Pages the provider with the
 * shared Redis rate limiter, streams each page to MarketplaceProduct, checkpoints the offset on the
 * MarketplaceImportJob row (so a BullMQ retry resumes instead of restarting), auto-maps once at the
 * end, and finalizes the job status. On a persistent throttle it penalizes the shop + throws so
 * BullMQ retries from the checkpoint (until the final attempt, which keeps the partial result).
 * Lazada-only (the live large-catalog case); non-Lazada stubs import synchronously on the request.
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

  await prisma.marketplaceImportJob.update({
    where: { id: importJobId },
    data: { status: 'PROCESSING', startedAt: job.startedAt ?? new Date(), lastError: null },
  });

  if (connection.provider !== 'LAZADA') {
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

  const env = getServerEnv();
  const client: LazadaClient = createLazadaClient({
    appKey: env.LAZADA_APP_KEY ?? '',
    appSecret: env.LAZADA_APP_SECRET ?? '',
    baseUrl: env.LAZADA_API_BASE_URL ?? LAZADA_BASE_URL,
  });

  const now = new Date();
  let offset = job.offsetCheckpoint;
  let importedRows = job.importedRows;
  let processedProducts = job.processedProducts;
  let errorCount = job.errorCount;
  let total: number | undefined = job.totalProducts ?? undefined;
  const warehouseCodes = new Set<string>();

  try {
    for (;;) {
      await acquireProviderToken('LAZADA', connection.shopId);
      const page = await fetchLazadaListingsPage(client, {
        accessToken,
        offset,
        limit: IMPORT_PAGE_LIMIT,
      });
      if (typeof page.total === 'number') total = page.total;

      const result = await upsertPage(ctx, page.items, now);
      importedRows += result.imported;
      errorCount += result.errors;
      for (const code of result.warehouseCodes) warehouseCodes.add(code);
      processedProducts += page.productCount;
      offset += IMPORT_PAGE_LIMIT;

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

      if (page.productCount < IMPORT_PAGE_LIMIT) break;
      if (total !== undefined && offset >= total) break;
    }
  } catch (error) {
    if (
      error instanceof LazadaApiError &&
      isTransientLazadaError(error.code, error.providerMessage)
    ) {
      await penalizeProvider('LAZADA', connection.shopId);
      const lastError = `Lazada throttled (code ${error.code}); resuming from offset ${offset}.`;
      if (opts.attemptNumber < opts.maxAttempts) {
        await prisma.marketplaceImportJob.update({
          where: { id: importJobId },
          data: { lastError },
        });
        throw error; // let BullMQ retry — runMarketplaceImport resumes from offsetCheckpoint
      }
      const status = importedRows > 0 ? 'PARTIAL' : 'FAILED';
      await prisma.marketplaceImportJob.update({
        where: { id: importJobId },
        data: { status, lastError, completedAt: new Date() },
      });
      return { status, importedRows, autoMappedCount: 0 };
    }
    const message = error instanceof Error ? error.message : String(error);
    await prisma.marketplaceImportJob.update({
      where: { id: importJobId },
      data: { status: 'FAILED', lastError: message, completedAt: new Date() },
    });
    logger.warn('marketplace.import.failed', {
      importJobId,
      connectionId: connection.id,
      error: message,
    });
    return { status: 'FAILED', importedRows, autoMappedCount: 0 };
  }

  const autoMappedCount = await autoMapImported(ctx);
  await prisma.marketplaceConnection.update({
    where: { id: connection.id },
    data: {
      lastImportedAt: now,
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
  return { status: 'COMPLETED', importedRows, autoMappedCount };
}
