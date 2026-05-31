export type NormalizedStockUpdateRequest = {
  externalProductId: string;
  externalVariantId: string;
  externalSku: string | null;
  quantity: number;
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
}): NormalizedStockUpdateRequest {
  return {
    externalProductId: input.externalProductId,
    externalVariantId: input.externalVariantId,
    externalSku: input.externalSku?.trim() || null,
    quantity: Math.max(0, Math.floor(input.availableStock)),
  };
}

export function normalizeStockUpdateResponse(raw: {
  success: boolean;
  externalStock?: number | null;
  raw?: Record<string, unknown> | null;
}): NormalizedStockUpdateResponse {
  return {
    success: raw.success,
    externalStock:
      typeof raw.externalStock === 'number' ? Math.max(0, Math.floor(raw.externalStock)) : null,
    raw: raw.raw ?? null,
  };
}
