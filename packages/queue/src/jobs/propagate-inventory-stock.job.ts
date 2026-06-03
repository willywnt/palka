import {
  buildPropagateJobId,
  buildStockSyncIdempotencyKey,
  buildSyncJobId,
  createSyncJob,
  findSyncJobByIdempotencyKey,
  findSyncReadyMappingsByVariant,
} from '../marketplace-sync/index.js';
import { createQueue } from '../queues/create-queue.js';
import {
  JOB_NAMES,
  QUEUE_NAMES,
  propagateInventoryStockJobSchema,
  type JobResultMetadata,
  type PropagateInventoryStockJobPayload,
} from '../types/index.js';

/**
 * Fan-out: for one variant's stock change, create an idempotent sync job per
 * sync-ready mapping and enqueue a per-mapping stock-sync job.
 */
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
  };

  const mappings = await findSyncReadyMappingsByVariant(payload.userId, payload.variantId);
  const syncQueue = createQueue(QUEUE_NAMES.MARKETPLACE_STOCK_SYNC);

  for (const mapping of mappings) {
    stats.processed += 1;
    const idempotencyKey = buildStockSyncIdempotencyKey(mapping.mappingId, payload.eventId);

    const existing = await findSyncJobByIdempotencyKey(idempotencyKey);
    if (existing) {
      stats.skipped += 1;
      continue;
    }

    const job = await createSyncJob({
      userId: payload.userId,
      marketplaceConnectionId: mapping.marketplaceConnectionId,
      marketplaceProductMappingId: mapping.mappingId,
      provider: mapping.provider,
      idempotencyKey,
      payload: { availableStock: payload.availableStock, eventId: payload.eventId },
    });

    await syncQueue.add(
      JOB_NAMES.SYNC_MARKETPLACE_STOCK,
      { syncJobId: job.id },
      { jobId: buildSyncJobId(job.id) },
    );
    stats.succeeded += 1;
  }

  stats.durationMs = Date.now() - startedAt;
  return stats;
}

export function buildPropagateInventoryStockEnqueueOptions(eventId: string): { jobId: string } {
  return { jobId: buildPropagateJobId(eventId) };
}
