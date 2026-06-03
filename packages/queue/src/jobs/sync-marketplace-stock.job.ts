import { executeStockSync } from '../marketplace-sync/index.js';
import {
  syncMarketplaceStockJobSchema,
  type JobResultMetadata,
  type SyncMarketplaceStockJobPayload,
} from '../types/index.js';

/**
 * Processes one mapping's stock push. On a retryable failure it throws so BullMQ
 * retries with backoff; skipped/non-retryable outcomes return normally.
 */
export async function processSyncMarketplaceStockJob(
  rawPayload: SyncMarketplaceStockJobPayload,
  attemptNumber: number,
  maxAttempts: number,
): Promise<JobResultMetadata> {
  const startedAt = Date.now();
  const payload = syncMarketplaceStockJobSchema.parse(rawPayload);

  const result = await executeStockSync(payload.syncJobId, attemptNumber, maxAttempts);

  if (!result.success && result.retryable && !result.skipped) {
    throw new Error(result.errorCode ?? 'SYNC_FAILED');
  }

  return {
    processed: 1,
    succeeded: result.success ? 1 : 0,
    failed: result.success || result.skipped ? 0 : 1,
    skipped: result.skipped ? 1 : 0,
    durationMs: Date.now() - startedAt,
    details: { syncJobId: payload.syncJobId, errorCode: result.errorCode ?? null },
  };
}
