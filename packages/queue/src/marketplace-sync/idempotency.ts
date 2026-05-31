export function buildStockSyncIdempotencyKey(mappingId: string, eventId: string): string {
  return `stock:${mappingId}:${eventId}`;
}

export function buildPropagateJobId(eventId: string): string {
  return `propagate:${eventId}`;
}

export function buildSyncJobId(syncJobId: string): string {
  return `sync:${syncJobId}`;
}

export function buildManualRetryIdempotencyKey(mappingId: string): string {
  return `stock:manual:${mappingId}:${Date.now()}`;
}
