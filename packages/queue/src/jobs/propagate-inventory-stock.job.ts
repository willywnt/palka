import { MARKETPLACE_SYNC_MAX_RETRIES } from '@olshop/config/limits';
import { logger } from '@olshop/utils/logger';

import { createQueue } from '../queues/create-queue.js';
import {
  JOB_NAMES,
  QUEUE_NAMES,
  propagateInventoryStockJobSchema,
  syncMarketplaceStockJobSchema,
  type JobResultMetadata,
  type PropagateInventoryStockJobPayload,
} from '../types/index.js';
import {
  buildPropagateJobId,
  buildStockSyncIdempotencyKey,
  buildSyncJobId,
} from '../marketplace-sync/idempotency.js';
import {
  createSyncJob,
  findSyncJobByIdempotencyKey,
  findSyncReadyMappingsByVariant,
} from '../marketplace-sync/sync-repository.js';

export async function processPropagateInventoryStockJob(
  rawPayload: PropagateInventoryStockJobPayload,
): Promise<JobResultMetadata> {
  const startedAt = Date.now();
  const payload = propagateInventoryStockJobSchema.parse(rawPayload);

  const stats: JobResultMetadata = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    durationMs: 0,
    details: { enqueued: 0, mappingsFound: 0 },
  };

  logger.info('marketplace.sync.propagate.started', {
    variantId: payload.variantId,
    eventId: payload.eventId,
    availableStock: payload.availableStock,
  });

  const mappings = await findSyncReadyMappingsByVariant(payload.variantId);
  stats.details!.mappingsFound = mappings.length;

  if (mappings.length === 0) {
    stats.durationMs = Date.now() - startedAt;
    logger.info('marketplace.sync.propagate.no_mappings', {
      variantId: payload.variantId,
      eventId: payload.eventId,
    });
    return stats;
  }

  const stockSyncQueue = createQueue(QUEUE_NAMES.MARKETPLACE_STOCK_SYNC, {
    defaultJobOptions: {
      attempts: MARKETPLACE_SYNC_MAX_RETRIES,
      backoff: { type: 'exponential', delay: 5_000 },
    },
  });

  for (const mapping of mappings) {
    stats.processed += 1;

    const idempotencyKey = buildStockSyncIdempotencyKey(mapping.id, payload.eventId);
    const existing = await findSyncJobByIdempotencyKey(idempotencyKey);

    if (existing?.syncStatus === 'SUCCESS') {
      stats.skipped += 1;
      continue;
    }

    const syncJob =
      existing ??
      (await createSyncJob({
        marketplaceAccountId: mapping.marketplaceAccountId,
        marketplaceProductMappingId: mapping.id,
        provider: mapping.provider,
        idempotencyKey,
        payload: {
          userId: payload.userId,
          variantId: payload.variantId,
          sku: payload.sku,
          eventId: payload.eventId,
          eventType: payload.eventType,
          availableStock: payload.availableStock,
        },
      }));

    const jobPayload = syncMarketplaceStockJobSchema.parse({
      syncJobId: syncJob.id,
      userId: payload.userId,
      mappingId: mapping.id,
      variantId: payload.variantId,
      availableStock: payload.availableStock,
      eventId: payload.eventId,
      enqueuedAt: new Date().toISOString(),
    });

    await stockSyncQueue.add(JOB_NAMES.SYNC_MARKETPLACE_STOCK, jobPayload, {
      jobId: buildSyncJobId(syncJob.id),
    });

    stats.succeeded += 1;
    stats.details!.enqueued = Number(stats.details!.enqueued) + 1;
  }

  stats.durationMs = Date.now() - startedAt;

  logger.info('marketplace.sync.propagate.completed', {
    variantId: payload.variantId,
    eventId: payload.eventId,
    mappingsFound: mappings.length,
    enqueued: stats.details!.enqueued,
    durationMs: stats.durationMs,
  });

  return stats;
}

export function buildPropagateInventoryStockEnqueueOptions(eventId: string) {
  return { jobId: buildPropagateJobId(eventId) };
}
