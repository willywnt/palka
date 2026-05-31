import type { MarketplaceProvider } from '@prisma/client';

/** Provider-agnostic marketplace product shape — internal code never reads raw payloads directly. */
export type NormalizedMarketplaceProduct = {
  externalProductId: string;
  externalVariantId: string;
  externalSku: string | null;
  externalProductName: string;
  externalVariantName: string | null;
  stock: number;
  status: string;
  rawPayload: Record<string, unknown>;
};

export type ProviderRawMarketplaceProduct = Record<string, unknown>;

export type FetchMarketplaceProductsResult = {
  provider: MarketplaceProvider;
  products: NormalizedMarketplaceProduct[];
  fetchedAt: Date;
};

export type AutoMatchCandidate = {
  marketplaceProductId: string;
  productVariantId: string;
  confidence: number;
  reason: 'exact_sku' | 'barcode' | 'name_similarity';
};
