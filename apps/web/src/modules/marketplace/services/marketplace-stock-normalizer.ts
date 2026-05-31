import type {
  NormalizedStockSyncRequest,
  NormalizedStockSyncResponse,
} from '../domain/stock-sync.types';

/** Web-side stock sync normalization — mirrors queue layer for API validation. */
export function normalizeStockSyncRequest(
  input: NormalizedStockSyncRequest,
): NormalizedStockSyncRequest {
  return {
    ...input,
    externalSku: input.externalSku?.trim() || null,
    quantity: Math.max(0, Math.floor(input.quantity)),
  };
}

export function normalizeStockSyncResponse(raw: {
  success: boolean;
  externalStock?: number | null;
  raw?: Record<string, unknown> | null;
}): NormalizedStockSyncResponse {
  return {
    success: raw.success,
    externalStock:
      typeof raw.externalStock === 'number' ? Math.max(0, Math.floor(raw.externalStock)) : null,
    raw: raw.raw ?? null,
  };
}
