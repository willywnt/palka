import 'server-only';

import {
  createQueue,
  JOB_NAMES,
  QUEUE_NAMES,
  buildManualRetryIdempotencyKey,
  buildSyncJobId,
} from '@olshop/queue';
import { prisma } from '@olshop/db';
import type { MarketplaceSyncJobStatus } from '@prisma/client';

import {
  toMarketplaceSyncJobDetailDto,
  toMarketplaceSyncJobListItemDto,
} from '../dto/sync.mappers';
import type {
  MarketplaceSyncJobDetailDto,
  MarketplaceSyncJobListItemDto,
  MarketplaceSyncOverviewDto,
} from '../dto/sync.dto';
import { MarketplaceError } from '../errors/marketplace-errors';
import { marketplaceProductMappingRepository } from '../repositories/marketplace-product-mapping.repository';
import { marketplaceSyncJobRepository } from '../repositories/marketplace-sync-job.repository';
import { appLogger } from '@/lib/logger';

export class MarketplaceSyncService {
  async listJobs(
    userId: string,
    options?: {
      marketplaceAccountId?: string;
      syncStatus?: MarketplaceSyncJobStatus;
      page?: number;
      pageSize?: number;
    },
  ): Promise<{ items: MarketplaceSyncJobListItemDto[]; total: number }> {
    const limit = options?.pageSize ?? 50;
    const offset = ((options?.page ?? 1) - 1) * limit;

    const [items, total] = await Promise.all([
      marketplaceSyncJobRepository.findManyByUser(userId, {
        marketplaceAccountId: options?.marketplaceAccountId,
        syncStatus: options?.syncStatus,
        limit,
        offset,
      }),
      marketplaceSyncJobRepository.countByUser(userId, {
        syncStatus: options?.syncStatus,
      }),
    ]);

    return {
      items: items.map(toMarketplaceSyncJobListItemDto),
      total,
    };
  }

  async getJobDetail(userId: string, syncJobId: string): Promise<MarketplaceSyncJobDetailDto> {
    const job = await marketplaceSyncJobRepository.findByIdForUser(userId, syncJobId);
    if (!job) throw MarketplaceError.syncNotFound();

    return toMarketplaceSyncJobDetailDto(job);
  }

  async getOverview(userId: string): Promise<MarketplaceSyncOverviewDto> {
    const [pending, success, failed, retrying, providerHealth] = await Promise.all([
      marketplaceSyncJobRepository.countByUser(userId, { syncStatus: 'PENDING' }),
      marketplaceSyncJobRepository.countByUser(userId, { syncStatus: 'SUCCESS' }),
      marketplaceSyncJobRepository.countByUser(userId, { syncStatus: 'FAILED' }),
      marketplaceSyncJobRepository.countByUser(userId, { syncStatus: 'RETRYING' }),
      marketplaceSyncJobRepository.findProviderHealthByUser(userId),
    ]);

    let queueWaiting = 0;
    let queueActive = 0;
    let queueFailed = 0;

    try {
      const inventoryQueue = createQueue(QUEUE_NAMES.INVENTORY_SYNC);
      const stockQueue = createQueue(QUEUE_NAMES.MARKETPLACE_STOCK_SYNC);

      const [inventoryCounts, stockCounts] = await Promise.all([
        inventoryQueue.getJobCounts('waiting', 'active', 'failed'),
        stockQueue.getJobCounts('waiting', 'active', 'failed'),
      ]);

      queueWaiting = (inventoryCounts.waiting ?? 0) + (stockCounts.waiting ?? 0);
      queueActive = (inventoryCounts.active ?? 0) + (stockCounts.active ?? 0);
      queueFailed = (inventoryCounts.failed ?? 0) + (stockCounts.failed ?? 0);
    } catch (error) {
      appLogger.warn('marketplace.sync.queue_metrics_unavailable', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return {
      pending,
      success,
      failed,
      retrying,
      queueWaiting,
      queueActive,
      queueFailed,
      providerHealth: providerHealth.map((health) => ({
        accountId: health.marketplaceAccountId,
        storeName: health.marketplaceAccount.storeName,
        provider: health.marketplaceAccount.provider,
        consecutiveFailures: health.consecutiveFailures,
        averageLatencyMs: health.averageLatencyMs,
        lastSuccessAt: health.lastSuccessAt?.toISOString() ?? null,
        lastFailureAt: health.lastFailureAt?.toISOString() ?? null,
        tokenValid: health.tokenValid,
      })),
    };
  }

  async retryJob(userId: string, syncJobId: string): Promise<MarketplaceSyncJobListItemDto> {
    const existing = await marketplaceSyncJobRepository.findByIdForUser(userId, syncJobId);
    if (!existing) throw MarketplaceError.syncNotFound();

    const payload =
      existing.payload && typeof existing.payload === 'object'
        ? (existing.payload as Record<string, unknown>)
        : {};

    const availableStock =
      typeof payload.availableStock === 'number'
        ? payload.availableStock
        : (existing.mapping.productVariant.inventory?.availableStock ?? 0);

    const idempotencyKey = buildManualRetryIdempotencyKey(existing.marketplaceProductMappingId);

    const syncJob = await prisma.marketplaceSyncJob.create({
      data: {
        marketplaceAccountId: existing.marketplaceAccountId,
        marketplaceProductMappingId: existing.marketplaceProductMappingId,
        provider: existing.provider,
        syncType: 'STOCK_PUSH',
        syncStatus: 'PENDING',
        idempotencyKey,
        payload: {
          ...payload,
          availableStock,
          manualRetry: true,
          retriedFrom: existing.id,
        },
      },
      include: {
        mapping: {
          include: {
            productVariant: { select: { sku: true, name: true } },
            marketplaceProduct: {
              select: { externalSku: true, externalProductName: true },
            },
          },
        },
        marketplaceAccount: {
          select: {
            id: true,
            storeName: true,
            provider: true,
            status: true,
            tokenExpiresAt: true,
            providerHealth: {
              select: { consecutiveFailures: true, lastSuccessAt: true },
            },
          },
        },
      },
    });

    const stockQueue = createQueue(QUEUE_NAMES.MARKETPLACE_STOCK_SYNC);

    await stockQueue.add(
      JOB_NAMES.SYNC_MARKETPLACE_STOCK,
      {
        syncJobId: syncJob.id,
        userId,
        mappingId: existing.marketplaceProductMappingId,
        variantId: existing.mapping.productVariantId,
        availableStock,
        enqueuedAt: new Date().toISOString(),
      },
      { jobId: buildSyncJobId(syncJob.id) },
    );

    appLogger.info('marketplace.sync.manual_retry', {
      userId,
      syncJobId: syncJob.id,
      retriedFrom: existing.id,
    });

    return toMarketplaceSyncJobListItemDto(syncJob);
  }

  async disableMappingSync(userId: string, mappingId: string): Promise<{ disabled: boolean }> {
    const mapping = await marketplaceProductMappingRepository.findByIdForUser(userId, mappingId);
    if (!mapping) throw MarketplaceError.notFound('Mapping not found.');

    await prisma.marketplaceProductMapping.update({
      where: { id: mappingId },
      data: { syncEnabled: false, mappingStatus: 'SYNC_DISABLED' },
    });

    await prisma.marketplaceSyncJob.updateMany({
      where: {
        marketplaceProductMappingId: mappingId,
        syncStatus: { in: ['PENDING', 'RETRYING'] },
      },
      data: {
        syncStatus: 'DISABLED',
        errorMessage: 'Sync disabled by operator.',
        completedAt: new Date(),
      },
    });

    appLogger.info('marketplace.sync.mapping_disabled', { userId, mappingId });

    return { disabled: true };
  }
}

export const marketplaceSyncService = new MarketplaceSyncService();
