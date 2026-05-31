import 'server-only';

import type { MarketplaceProvider } from '@prisma/client';

import type {
  NormalizedMarketplaceProduct,
  ProviderRawMarketplaceProduct,
} from '../domain/normalized-product.types';

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return fallback;
}

/** Central normalization — provider adapters delegate here after extracting raw fields. */
export class MarketplaceProductNormalizer {
  normalizeShopee(raw: ProviderRawMarketplaceProduct): NormalizedMarketplaceProduct | null {
    const externalProductId = readString(raw.item_id) ?? readString(raw.product_id);
    const externalVariantId =
      readString(raw.model_id) ?? readString(raw.variant_id) ?? externalProductId;

    if (!externalProductId || !externalVariantId) return null;

    return {
      externalProductId,
      externalVariantId,
      externalSku: readString(raw.item_sku) ?? readString(raw.sku),
      externalProductName:
        readString(raw.item_name) ?? readString(raw.product_name) ?? 'Shopee Product',
      externalVariantName: readString(raw.model_name) ?? readString(raw.variant_name),
      stock: readNumber(raw.stock ?? raw.normal_stock),
      status: readString(raw.item_status) ?? 'active',
      rawPayload: raw,
    };
  }

  normalizeTokopedia(raw: ProviderRawMarketplaceProduct): NormalizedMarketplaceProduct | null {
    const externalProductId = readString(raw.product_id) ?? readString(raw.id);
    const externalVariantId = readString(raw.variant_id) ?? externalProductId;

    if (!externalProductId || !externalVariantId) return null;

    return {
      externalProductId,
      externalVariantId,
      externalSku: readString(raw.sku),
      externalProductName:
        readString(raw.name) ?? readString(raw.product_name) ?? 'Tokopedia Product',
      externalVariantName: readString(raw.variant_name),
      stock: readNumber(raw.stock),
      status: readString(raw.status) ?? 'active',
      rawPayload: raw,
    };
  }

  normalizeGeneric(
    provider: MarketplaceProvider,
    raw: ProviderRawMarketplaceProduct,
  ): NormalizedMarketplaceProduct | null {
    const externalProductId =
      readString(raw.externalProductId) ?? readString(raw.product_id) ?? readString(raw.productId);
    const externalVariantId =
      readString(raw.externalVariantId) ??
      readString(raw.variant_id) ??
      readString(raw.variantId) ??
      externalProductId;

    if (!externalProductId || !externalVariantId) return null;

    return {
      externalProductId,
      externalVariantId,
      externalSku: readString(raw.externalSku) ?? readString(raw.sku),
      externalProductName:
        readString(raw.externalProductName) ??
        readString(raw.product_name) ??
        readString(raw.name) ??
        `${provider} Product`,
      externalVariantName: readString(raw.externalVariantName) ?? readString(raw.variant_name),
      stock: readNumber(raw.stock),
      status: readString(raw.status) ?? 'active',
      rawPayload: raw,
    };
  }

  normalize(
    provider: MarketplaceProvider,
    raw: ProviderRawMarketplaceProduct,
  ): NormalizedMarketplaceProduct | null {
    if (provider === 'SHOPEE') return this.normalizeShopee(raw);
    if (provider === 'TOKOPEDIA') return this.normalizeTokopedia(raw);
    return this.normalizeGeneric(provider, raw);
  }
}

export const marketplaceProductNormalizer = new MarketplaceProductNormalizer();
