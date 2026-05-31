import type { MarketplaceProvider } from '@prisma/client';

export type StockUpdateParams = {
  accessToken: string;
  externalProductId: string;
  externalVariantId: string;
  externalSku: string | null;
  quantity: number;
};

export type StockUpdateResult = {
  success: boolean;
  externalStock?: number | null;
  raw?: Record<string, unknown> | null;
};

export type StockSyncValidation = {
  ready: boolean;
  reason?: string;
};

export type NormalizedStockSyncRequest = {
  provider: MarketplaceProvider;
  externalProductId: string;
  externalVariantId: string;
  externalSku: string | null;
  quantity: number;
};

export type NormalizedStockSyncResponse = {
  success: boolean;
  externalStock: number | null;
  raw: Record<string, unknown> | null;
};
