import { JOB_NAMES, QUEUE_NAMES } from '../types/index.js';
import { createQueue } from './create-queue.js';

/** BullMQ job id for an import run. The MarketplaceImportJob row id (a cuid) is already unique per
 *  run and contains no ':' (BullMQ forbids it), so it doubles as a stable, dedupe-safe job id. */
export function buildImportJobId(importJobRowId: string): string {
  return `import-${importJobRowId}`;
}

/**
 * Enqueue a background catalog import for an already-created MarketplaceImportJob row. The route is
 * the dedupe point (it refuses a second active job per connection), so the only payload is the row
 * id — the worker reads the connection + checkpoint from the DB. More BullMQ attempts than the
 * default because each retry RESUMES from the row's offset checkpoint (so every attempt makes
 * progress through a throttle), with a longer exponential backoff to let flow-control cool off.
 */
export async function enqueueImportMarketplaceListings(importJobRowId: string): Promise<void> {
  const queue = createQueue(QUEUE_NAMES.MARKETPLACE_IMPORT);
  await queue.add(
    JOB_NAMES.IMPORT_MARKETPLACE_LISTINGS,
    { importJobId: importJobRowId },
    {
      jobId: buildImportJobId(importJobRowId),
      attempts: 8,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}
