import { MARKETPLACE_SYNC_MAX_RETRIES } from '@olshop/config/limits';
import { logger } from '@olshop/utils/logger';

import { executeStockSync } from '../marketplace-sync/sync-engine.js';
import {
  syncMarketplaceStockJobSchema,
  type JobResultMetadata,
  type SyncMarketplaceStockJobPayload,
} from '../types/index.js';

export async function processSyncMarketplaceStockJob(
  rawPayload: SyncMarketplaceStockJobPayload,
  attemptNumber: number,
): Promise<JobResultMetadata> {
  const startedAt = Date.now();
  const payload = syncMarketplaceStockJobSchema.parse(rawPayload);

  logger.info('marketplace.sync.job.started', {
    syncJobId: payload.syncJobId,
    mappingId: payload.mappingId,
    attempt: attemptNumber,
  });

  const result = await executeStockSync({
    syncJobId: payload.syncJobId,
    availableStock: payload.availableStock,
    attemptNumber,
    maxAttempts: MARKETPLACE_SYNC_MAX_RETRIES,
  });

  const stats: JobResultMetadata = {
    processed: 1,
    succeeded: result.success ? 1 : 0,
    failed: result.success ? 0 : 1,
    skipped: result.skipped ? 1 : 0,
    durationMs: Date.now() - startedAt,
    details: {
      syncJobId: payload.syncJobId,
      errorCode: result.errorCode,
      retryable: result.retryable,
    },
  };

  return stats;
}
