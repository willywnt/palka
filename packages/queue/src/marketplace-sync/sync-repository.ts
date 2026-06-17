import { prisma } from '@falka/db';
import type { MarketplaceProvider, Prisma } from '@prisma/client';

export type SyncReadyMapping = {
  mappingId: string;
  marketplaceConnectionId: string;
  provider: MarketplaceProvider;
  marketplaceProductId: string;
};

/**
 * Mappings eligible to receive a stock push for a given variant. When
 * `excludeConnectionId` is set, mappings on that connection are skipped — used for
 * inbound orders so the source channel isn't re-synced against its own change.
 */
export async function findSyncReadyMappingsByVariant(
  organizationId: string,
  variantId: string,
  excludeConnectionId?: string,
): Promise<SyncReadyMapping[]> {
  const mappings = await prisma.marketplaceProductMapping.findMany({
    where: {
      organizationId,
      productVariantId: variantId,
      syncEnabled: true,
      connection: { isActive: true, deletedAt: null },
      marketplaceProduct: { deletedAt: null },
      ...(excludeConnectionId ? { marketplaceConnectionId: { not: excludeConnectionId } } : {}),
    },
    select: {
      id: true,
      marketplaceConnectionId: true,
      provider: true,
      marketplaceProductId: true,
    },
  });

  return mappings.map((mapping) => ({
    mappingId: mapping.id,
    marketplaceConnectionId: mapping.marketplaceConnectionId,
    provider: mapping.provider,
    marketplaceProductId: mapping.marketplaceProductId,
  }));
}

export async function findSyncJobByIdempotencyKey(
  idempotencyKey: string,
): Promise<{ id: string } | null> {
  return prisma.marketplaceSyncJob.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
}

export async function createSyncJob(data: {
  organizationId: string;
  actorUserId: string;
  marketplaceConnectionId: string;
  marketplaceProductMappingId: string;
  provider: MarketplaceProvider;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}): Promise<{ id: string }> {
  return prisma.marketplaceSyncJob.create({
    data: {
      userId: data.actorUserId,
      organizationId: data.organizationId,
      marketplaceConnectionId: data.marketplaceConnectionId,
      marketplaceProductMappingId: data.marketplaceProductMappingId,
      provider: data.provider,
      idempotencyKey: data.idempotencyKey,
      payload: data.payload as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
}

export type SyncJobContext = {
  jobId: string;
  attempts: number;
  provider: MarketplaceProvider;
  connectionId: string;
  mappingId: string;
  marketplaceProductId: string;
  syncEnabled: boolean;
  connectionActive: boolean;
  shopId: string;
  shopCipher: string | null;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: Date | null;
  syncWarehouseCode: string | null;
  externalProductId: string;
  externalVariantId: string;
  externalSku: string | null;
  availableStock: number;
  variantDeleted: boolean;
  productDeleted: boolean;
};

export async function loadSyncJobContext(syncJobId: string): Promise<SyncJobContext | null> {
  const job = await prisma.marketplaceSyncJob.findUnique({
    where: { id: syncJobId },
    select: {
      id: true,
      attempts: true,
      provider: true,
      marketplaceConnectionId: true,
      marketplaceProductMappingId: true,
      connection: {
        select: {
          isActive: true,
          deletedAt: true,
          shopId: true,
          externalShopCipher: true,
          encryptedAccessToken: true,
          encryptedRefreshToken: true,
          tokenExpiresAt: true,
          syncWarehouseCode: true,
        },
      },
      mapping: {
        select: {
          syncEnabled: true,
          marketplaceProductId: true,
          marketplaceProduct: {
            select: {
              externalProductId: true,
              externalVariantId: true,
              externalSku: true,
              deletedAt: true,
            },
          },
          productVariant: {
            select: { deletedAt: true, inventory: { select: { availableStock: true } } },
          },
        },
      },
    },
  });

  if (!job) return null;

  return {
    jobId: job.id,
    attempts: job.attempts,
    provider: job.provider,
    connectionId: job.marketplaceConnectionId,
    mappingId: job.marketplaceProductMappingId,
    marketplaceProductId: job.mapping.marketplaceProductId,
    syncEnabled: job.mapping.syncEnabled,
    connectionActive: job.connection.isActive && job.connection.deletedAt === null,
    shopId: job.connection.shopId,
    shopCipher: job.connection.externalShopCipher,
    encryptedAccessToken: job.connection.encryptedAccessToken,
    encryptedRefreshToken: job.connection.encryptedRefreshToken,
    tokenExpiresAt: job.connection.tokenExpiresAt,
    syncWarehouseCode: job.connection.syncWarehouseCode,
    externalProductId: job.mapping.marketplaceProduct.externalProductId,
    externalVariantId: job.mapping.marketplaceProduct.externalVariantId,
    externalSku: job.mapping.marketplaceProduct.externalSku,
    availableStock: job.mapping.productVariant.inventory?.availableStock ?? 0,
    variantDeleted: job.mapping.productVariant.deletedAt !== null,
    productDeleted: job.mapping.marketplaceProduct.deletedAt !== null,
  };
}

export async function markSyncJobProcessing(syncJobId: string): Promise<void> {
  await prisma.marketplaceSyncJob.update({
    where: { id: syncJobId },
    data: { syncStatus: 'PROCESSING', attempts: { increment: 1 }, lastAttemptAt: new Date() },
  });
}

export async function completeSyncJobSuccess(params: {
  syncJobId: string;
  mappingId: string;
  marketplaceProductId: string;
  externalStock: number | null;
  providerResponse: Record<string, unknown>;
}): Promise<void> {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.marketplaceSyncJob.update({
      where: { id: params.syncJobId },
      data: {
        syncStatus: 'SUCCESS',
        providerResponse: params.providerResponse as Prisma.InputJsonValue,
        completedAt: now,
        errorMessage: null,
      },
    });

    await tx.marketplaceProductMapping.update({
      where: { id: params.mappingId },
      data: { lastSyncedAt: now, lastSyncStatus: 'SYNCED', lastSyncError: null },
    });

    await tx.marketplaceProduct.update({
      where: { id: params.marketplaceProductId },
      data: {
        lastSyncedAt: now,
        ...(params.externalStock !== null ? { stock: params.externalStock } : {}),
      },
    });
  });
}

export async function failSyncJob(params: {
  syncJobId: string;
  mappingId: string;
  errorMessage: string;
  finalFailure: boolean;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.marketplaceSyncJob.update({
      where: { id: params.syncJobId },
      data: {
        syncStatus: 'FAILED',
        errorMessage: params.errorMessage,
        completedAt: params.finalFailure ? new Date() : null,
      },
    });

    // Only surface FAILED on the user-facing mapping once retries are exhausted — a RETRYABLE
    // hiccup (e.g. Lazada code 1002 sentinel/flow-control) succeeds on the next attempt, so it
    // must not flash "sinkronisasi gagal" mid-retry. The job row above still records each attempt.
    if (params.finalFailure) {
      await tx.marketplaceProductMapping.update({
        where: { id: params.mappingId },
        data: { lastSyncStatus: 'FAILED', lastSyncError: params.errorMessage },
      });
    }
  });
}

export async function disableSyncJob(params: { syncJobId: string; reason: string }): Promise<void> {
  await prisma.marketplaceSyncJob.update({
    where: { id: params.syncJobId },
    data: { syncStatus: 'DISABLED', errorMessage: params.reason, completedAt: new Date() },
  });
}
