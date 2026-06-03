import { buildPropagateJobId } from '../marketplace-sync/idempotency.js';
import { JOB_NAMES, QUEUE_NAMES, type PropagateInventoryStockJobPayload } from '../types/index.js';
import { createQueue } from './create-queue.js';

/**
 * Enqueues an outbound stock propagation for a variant. The job id is derived
 * from the stock-event id so the same event never enqueues twice. Callers should
 * treat this as best-effort and not fail the underlying stock change if it throws.
 */
export async function enqueuePropagateInventoryStock(
  payload: PropagateInventoryStockJobPayload,
): Promise<void> {
  const queue = createQueue(QUEUE_NAMES.MARKETPLACE_PROPAGATE);
  await queue.add(JOB_NAMES.PROPAGATE_INVENTORY_STOCK, payload, {
    jobId: buildPropagateJobId(payload.eventId),
  });
}
