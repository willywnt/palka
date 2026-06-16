export type NormalizedStockUpdateRequest = {
  externalProductId: string;
  externalVariantId: string;
  externalSku: string | null;
  quantity: number;
  /**
   * Provider-specific: the connection's designated sync warehouse (Lazada multi-warehouse).
   * When set, the push targets ONLY this warehouseCode and leaves the others untouched.
   * null = single-warehouse / not configured.
   */
  syncWarehouseCode: string | null;
};

export type NormalizedStockUpdateResponse = {
  success: boolean;
  externalStock: number | null;
  raw: Record<string, unknown> | null;
};

export function normalizeStockUpdateRequest(input: {
  externalProductId: string;
  externalVariantId: string;
  externalSku: string | null;
  availableStock: number;
  syncWarehouseCode?: string | null;
}): NormalizedStockUpdateRequest {
  return {
    externalProductId: input.externalProductId,
    externalVariantId: input.externalVariantId,
    externalSku: input.externalSku,
    // Marketplaces only accept a non-negative whole stock count.
    quantity: Math.max(0, Math.trunc(input.availableStock)),
    syncWarehouseCode: input.syncWarehouseCode ?? null,
  };
}

export function normalizeStockUpdateResponse(raw: {
  success: boolean;
  externalStock?: number | null;
  raw?: Record<string, unknown> | null;
}): NormalizedStockUpdateResponse {
  return {
    success: raw.success,
    externalStock: raw.externalStock ?? null,
    raw: raw.raw ?? null,
  };
}
