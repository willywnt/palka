import type { MarketplaceMappingStatus, MarketplaceSyncJobStatus, Prisma } from '@prisma/client';
import { prisma } from '@olshop/db';

export type SyncReadyMapping = {
  id: string;
  marketplaceAccountId: string;
  provider: string;
  syncEnabled: boolean;
  mappingStatus: MarketplaceMappingStatus;
  productVariantId: string;
  marketplaceProductId: string;
  externalProductId: string;
  externalVariantId: string;
  externalSku: string | null;
  accountStatus: string;
  tokenExpiresAt: Date | null;
  encryptedAccessToken: string;
  productDeleted: boolean;
  variantDeleted: boolean;
};

export async function findSyncReadyMappingsByVariant(
  variantId: string,
): Promise<SyncReadyMapping[]> {
  const mappings = await prisma.marketplaceProductMapping.findMany({
    where: {
      productVariantId: variantId,
      deletedAt: null,
      syncEnabled: true,
      mappingStatus: 'MAPPED',
      marketplaceAccount: { deletedAt: null, status: 'CONNECTED' },
    },
    include: {
      marketplaceProduct: {
        select: {
          id: true,
          externalProductId: true,
          externalVariantId: true,
          externalSku: true,
          deletedAt: true,
        },
      },
      marketplaceAccount: {
        select: {
          id: true,
          provider: true,
          status: true,
          tokenExpiresAt: true,
          encryptedAccessToken: true,
        },
      },
      productVariant: {
        select: { id: true, deletedAt: true, isActive: true },
      },
    },
  });

  return mappings
    .filter(
      (mapping) =>
        !mapping.marketplaceProduct.deletedAt &&
        !mapping.productVariant.deletedAt &&
        mapping.productVariant.isActive,
    )
    .map((mapping) => ({
      id: mapping.id,
      marketplaceAccountId: mapping.marketplaceAccountId,
      provider: mapping.provider,
      syncEnabled: mapping.syncEnabled,
      mappingStatus: mapping.mappingStatus,
      productVariantId: mapping.productVariantId,
      marketplaceProductId: mapping.marketplaceProductId,
      externalProductId: mapping.marketplaceProduct.externalProductId,
      externalVariantId: mapping.marketplaceProduct.externalVariantId,
      externalSku: mapping.marketplaceProduct.externalSku,
      accountStatus: mapping.marketplaceAccount.status,
      tokenExpiresAt: mapping.marketplaceAccount.tokenExpiresAt,
      encryptedAccessToken: mapping.marketplaceAccount.encryptedAccessToken,
      productDeleted: Boolean(mapping.marketplaceProduct.deletedAt),
      variantDeleted: Boolean(mapping.productVariant.deletedAt),
    }));
}

export async function findSyncJobByIdempotencyKey(idempotencyKey: string) {
  return prisma.marketplaceSyncJob.findUnique({ where: { idempotencyKey } });
}

export async function createSyncJob(data: {
  marketplaceAccountId: string;
  marketplaceProductMappingId: string;
  provider: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}) {
  return prisma.marketplaceSyncJob.create({
    data: {
      marketplaceAccountId: data.marketplaceAccountId,
      marketplaceProductMappingId: data.marketplaceProductMappingId,
      provider: data.provider as never,
      syncType: 'STOCK_PUSH',
      syncStatus: 'PENDING',
      idempotencyKey: data.idempotencyKey,
      payload: data.payload as Prisma.InputJsonValue,
    },
  });
}

export async function markSyncJobProcessing(syncJobId: string) {
  return prisma.marketplaceSyncJob.update({
    where: { id: syncJobId },
    data: {
      syncStatus: 'PROCESSING',
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  });
}

export async function markSyncJobSuccess(
  syncJobId: string,
  providerResponse: Record<string, unknown>,
) {
  return prisma.marketplaceSyncJob.update({
    where: { id: syncJobId },
    data: {
      syncStatus: 'SUCCESS',
      providerResponse: providerResponse as Prisma.InputJsonValue,
      errorMessage: null,
      completedAt: new Date(),
    },
  });
}

export async function markSyncJobFailed(
  syncJobId: string,
  errorMessage: string,
  retrying: boolean,
) {
  const status: MarketplaceSyncJobStatus = retrying ? 'RETRYING' : 'FAILED';

  return prisma.marketplaceSyncJob.update({
    where: { id: syncJobId },
    data: {
      syncStatus: status,
      errorMessage,
      completedAt: retrying ? null : new Date(),
    },
  });
}

export async function markSyncJobDisabled(syncJobId: string, reason: string) {
  return prisma.marketplaceSyncJob.update({
    where: { id: syncJobId },
    data: {
      syncStatus: 'DISABLED',
      errorMessage: reason,
      completedAt: new Date(),
    },
  });
}

export async function recordProviderHealthSuccess(marketplaceAccountId: string, latencyMs: number) {
  const existing = await prisma.marketplaceProviderHealth.findUnique({
    where: { marketplaceAccountId },
  });

  const averageLatencyMs = existing?.averageLatencyMs
    ? Math.round((existing.averageLatencyMs + latencyMs) / 2)
    : latencyMs;

  return prisma.marketplaceProviderHealth.upsert({
    where: { marketplaceAccountId },
    create: {
      marketplaceAccountId,
      lastSuccessAt: new Date(),
      consecutiveFailures: 0,
      averageLatencyMs,
      tokenValid: true,
    },
    update: {
      lastSuccessAt: new Date(),
      consecutiveFailures: 0,
      averageLatencyMs,
      tokenValid: true,
      lastErrorCode: null,
    },
  });
}

export async function recordProviderHealthFailure(
  marketplaceAccountId: string,
  errorCode: string,
  tokenValid = true,
) {
  const existing = await prisma.marketplaceProviderHealth.findUnique({
    where: { marketplaceAccountId },
  });

  return prisma.marketplaceProviderHealth.upsert({
    where: { marketplaceAccountId },
    create: {
      marketplaceAccountId,
      lastFailureAt: new Date(),
      consecutiveFailures: 1,
      lastErrorCode: errorCode,
      tokenValid,
    },
    update: {
      lastFailureAt: new Date(),
      consecutiveFailures: (existing?.consecutiveFailures ?? 0) + 1,
      lastErrorCode: errorCode,
      tokenValid,
    },
  });
}

export async function writeSyncLog(data: {
  mappingId: string;
  status: 'SYNCED' | 'FAILED' | 'PENDING';
  direction: string;
  message?: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.marketplaceSyncLog.create({
    data: {
      mappingId: data.mappingId,
      status: data.status,
      direction: data.direction,
      message: data.message ?? null,
      metadata: (data.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function updateMarketplaceProductStock(
  marketplaceProductId: string,
  marketplaceAccountId: string,
  stock: number,
) {
  const now = new Date();

  await prisma.$transaction([
    prisma.marketplaceProduct.update({
      where: { id: marketplaceProductId },
      data: { stock, lastSyncedAt: now },
    }),
    prisma.marketplaceAccount.update({
      where: { id: marketplaceAccountId },
      data: { lastSyncAt: now },
    }),
  ]);
}

export async function loadSyncJobContext(syncJobId: string) {
  return prisma.marketplaceSyncJob.findUnique({
    where: { id: syncJobId },
    include: {
      mapping: {
        include: {
          marketplaceProduct: true,
          marketplaceAccount: true,
          productVariant: { include: { inventory: true } },
        },
      },
    },
  });
}
