import { getServerEnv } from '@falka/config/env.server';
import type { MarketplaceProvider } from '@prisma/client';

import { LazadaImportAdapter } from './lazada-import-adapter';

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
  /**
   * Fetch current stock for SPECIFIC external products only (drift reconciliation),
   * avoiding a full-catalog pull. Optional — providers without it fall back to
   * {@link fetchListings} (fine for the stub's tiny catalog).
   */
  fetchListingsForItems?(params: {
    accessToken: string;
    externalProductIds: string[];
  }): Promise<NormalizedListing[]>;
}

const STUB_CATALOG = [
  { name: 'Cotton Tee', variants: ['Black / S', 'Black / M', 'White / M'] },
  { name: 'Canvas Tote', variants: ['Natural'] },
  { name: 'Enamel Mug', variants: ['300ml', '450ml'] },
] as const;

/** A realistic seller SKU derived from the variant name ("Black / M" -> "BLACK-M"). */
function slugifySku(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Deterministic stand-in for a real provider API: the same shop always yields
 * the same listings, so re-importing is idempotent. External SKUs mirror the
 * variant (as a real seller would set them) so SKU auto-map is demonstrable.
 * Real Shopee/Tokopedia/TikTok adapters replace this without touching the import service.
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
        const externalSku = slugifySku(variantName);

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

/** Real adapter when the provider is configured via env; the stub otherwise. */
function createImportAdapter(provider: MarketplaceProvider): MarketplaceImportAdapter {
  const env = getServerEnv();

  if (provider === 'LAZADA' && env.LAZADA_APP_KEY && env.LAZADA_APP_SECRET) {
    return new LazadaImportAdapter();
  }

  return new StubMarketplaceImportAdapter(provider);
}

export function getMarketplaceImportAdapter(
  provider: MarketplaceProvider,
): MarketplaceImportAdapter {
  const existing = adapters.get(provider);
  if (existing) return existing;

  const adapter = createImportAdapter(provider);
  adapters.set(provider, adapter);
  return adapter;
}
