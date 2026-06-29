import { runMarketplaceImport } from '../marketplace-sync/import-engine.js';
import {
  importMarketplaceListingsJobSchema,
  type ImportMarketplaceListingsJobPayload,
  type JobResultMetadata,
} from '../types/index.js';

/**
 * Background marketplace catalog import. Drives ONE MarketplaceImportJob row: pages the provider
 * under the shared rate limiter, streams listings to the DB, checkpoints the offset, auto-maps, and
 * finalizes status. The engine resumes from the row's checkpoint, so a BullMQ retry (after a
 * persistent throttle) continues instead of restarting. attemptNumber/maxAttempts let the engine
 * keep a partial result on the final attempt instead of looping forever.
 */
export async function processImportMarketplaceListingsJob(
  rawPayload: ImportMarketplaceListingsJobPayload,
  attemptNumber: number,
  maxAttempts: number,
): Promise<JobResultMetadata> {
  const startedAt = Date.now();
  const { importJobId } = importMarketplaceListingsJobSchema.parse(rawPayload);

  const result = await runMarketplaceImport(importJobId, { attemptNumber, maxAttempts });

  return {
    processed: result.importedRows,
    succeeded: result.status === 'FAILED' ? 0 : result.importedRows,
    failed: result.status === 'FAILED' ? result.importedRows : 0,
    skipped: 0,
    durationMs: Date.now() - startedAt,
    details: { status: result.status, autoMapped: result.autoMappedCount, importJobId },
  };
}
