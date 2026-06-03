/** One sync job per (mapping, stock-change event) — re-running the propagate is a no-op. */
export function buildStockSyncIdempotencyKey(mappingId: string, eventId: string): string {
  return `stock-sync:${mappingId}:${eventId}`;
}

// BullMQ rejects a ':' in a custom job id, so these use '-' (the DB idempotency
// key above keeps ':' — it is a plain column, not a BullMQ id).
export function buildPropagateJobId(eventId: string): string {
  return `propagate-${eventId}`;
}

export function buildSyncJobId(syncJobId: string): string {
  return `sync-${syncJobId}`;
}

export function buildManualRetryEventId(mappingId: string, timestampMs: number): string {
  return `manual-${mappingId}-${timestampMs}`;
}
