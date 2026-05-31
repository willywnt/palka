import 'server-only';

import {
  createQueue,
  JOB_NAMES,
  QUEUE_NAMES,
  buildPropagateInventoryStockEnqueueOptions,
} from '@olshop/queue';

import type { InventoryMutationHookPayload } from '../domain/mutation.types';
import { appLogger } from '@/lib/logger';

export type InventorySyncJobPayload = {
  userId: string;
  variantId: string;
  sku: string;
  eventId: string;
  eventType: InventoryMutationHookPayload['eventType'];
  availableStock: number;
  enqueuedAt: string;
};

/**
 * Async marketplace stock propagation — enqueues BullMQ job after inventory mutation.
 * Inventory mutation never waits for marketplace API latency.
 */
export async function enqueueInventorySyncPropagation(
  payload: InventoryMutationHookPayload,
): Promise<void> {
  if (payload.eventType === 'SYNC') {
    appLogger.info('inventory.sync.enqueue_skipped', {
      reason: 'inbound_sync_event',
      eventId: payload.eventId,
    });
    return;
  }

  const jobPayload: InventorySyncJobPayload = {
    userId: payload.userId,
    variantId: payload.variantId,
    sku: payload.sku,
    eventId: payload.eventId,
    eventType: payload.eventType,
    availableStock: payload.newStock,
    enqueuedAt: new Date().toISOString(),
  };

  const queue = createQueue(QUEUE_NAMES.INVENTORY_SYNC);

  await queue.add(JOB_NAMES.PROPAGATE_INVENTORY_STOCK, jobPayload, {
    ...buildPropagateInventoryStockEnqueueOptions(payload.eventId),
    removeOnComplete: { age: 24 * 60 * 60, count: 5_000 },
  });

  appLogger.info('inventory.sync.enqueued', {
    queue: QUEUE_NAMES.INVENTORY_SYNC,
    job: JOB_NAMES.PROPAGATE_INVENTORY_STOCK,
    eventId: payload.eventId,
    variantId: payload.variantId,
  });
}
