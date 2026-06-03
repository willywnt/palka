import type { MarketplaceProvider } from '@prisma/client';

/** A marketplace listing normalized to our shape, regardless of provider. */
export type NormalizedListing = {
  externalProductId: string;
  externalVariantId: string;
  externalSku: string | null;
  externalProductName: string;
  externalVariantName: string | null;
  stock: number;
  status: string;
  raw: Record<string, unknown>;
};

export interface MarketplaceImportAdapter {
  readonly provider: MarketplaceProvider;
  fetchListings(params: { shopId: string; accessToken: string }): Promise<NormalizedListing[]>;
}

const STUB_CATALOG = [
  { name: 'Cotton Tee', variants: ['Black / S', 'Black / M', 'White / M'] },
  { name: 'Canvas Tote', variants: ['Natural'] },
  { name: 'Enamel Mug', variants: ['300ml', '450ml'] },
] as const;

/**
 * Deterministic stand-in for a real provider API: the same shop always yields
 * the same listings, so re-importing is idempotent. Real Shopee/Tokopedia/TikTok
 * adapters replace this without touching the import service.
 */
export class StubMarketplaceImportAdapter implements MarketplaceImportAdapter {
  constructor(readonly provider: MarketplaceProvider) {}

  fetchListings(params: { shopId: string }): Promise<NormalizedListing[]> {
    const listings: NormalizedListing[] = [];
    let index = 0;

    for (const product of STUB_CATALOG) {
      for (const variantName of product.variants) {
        index += 1;
        const externalProductId = `${params.shopId}-P${index}`;
        const externalVariantId = `${params.shopId}-V${index}`;
        const externalSku = `${this.provider}-${params.shopId}-${index}`;

        listings.push({
          externalProductId,
          externalVariantId,
          externalSku,
          externalProductName: product.name,
          externalVariantName: variantName,
          stock: (index * 7 + 3) % 40,
          status: 'ACTIVE',
          raw: { externalProductId, externalVariantId, externalSku, source: 'stub' },
        });
      }
    }

    return Promise.resolve(listings);
  }
}

const adapters = new Map<MarketplaceProvider, MarketplaceImportAdapter>();

export function getMarketplaceImportAdapter(
  provider: MarketplaceProvider,
): MarketplaceImportAdapter {
  const existing = adapters.get(provider);
  if (existing) return existing;

  const adapter = new StubMarketplaceImportAdapter(provider);
  adapters.set(provider, adapter);
  return adapter;
}
