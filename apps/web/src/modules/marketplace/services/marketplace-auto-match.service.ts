import 'server-only';

import { prisma } from '@olshop/db';

import type {
  AutoMatchCandidate,
  NormalizedMarketplaceProduct,
} from '../domain/normalized-product.types';
import { marketplaceProductMappingRepository } from '../repositories/marketplace-product-mapping.repository';

const EXACT_SKU_CONFIDENCE = 1;
const BARCODE_CONFIDENCE = 0.95;

/**
 * Safe auto-matching — exact SKU and barcode only. No fuzzy name auto-map.
 */
export class MarketplaceAutoMatchService {
  async findExactSkuCandidates(
    userId: string,
    marketplaceAccountId: string,
    products: NormalizedMarketplaceProduct[],
    persistedProductIds: Map<string, string>,
  ): Promise<AutoMatchCandidate[]> {
    const candidates: AutoMatchCandidate[] = [];

    for (const product of products) {
      if (!product.externalSku?.trim()) continue;

      const marketplaceProductId = persistedProductIds.get(product.externalVariantId);
      if (!marketplaceProductId) continue;

      const existingProductMapping =
        await marketplaceProductMappingRepository.findByProductAndAccount(
          marketplaceProductId,
          marketplaceAccountId,
        );

      if (existingProductMapping) continue;

      const variant = await prisma.productVariant.findFirst({
        where: {
          userId,
          sku: { equals: product.externalSku.trim(), mode: 'insensitive' },
          deletedAt: null,
        },
      });

      if (!variant) continue;

      const existingVariantMapping =
        await marketplaceProductMappingRepository.findByVariantAndAccount(
          variant.id,
          marketplaceAccountId,
        );

      if (existingVariantMapping) continue;

      candidates.push({
        marketplaceProductId,
        productVariantId: variant.id,
        confidence: EXACT_SKU_CONFIDENCE,
        reason: 'exact_sku',
      });
    }

    return candidates;
  }

  async findBarcodeCandidates(
    userId: string,
    marketplaceAccountId: string,
    products: NormalizedMarketplaceProduct[],
    persistedProductIds: Map<string, string>,
  ): Promise<AutoMatchCandidate[]> {
    const candidates: AutoMatchCandidate[] = [];

    for (const product of products) {
      const barcode = product.rawPayload.barcode;
      if (typeof barcode !== 'string' || !barcode.trim()) continue;

      const marketplaceProductId = persistedProductIds.get(product.externalVariantId);
      if (!marketplaceProductId) continue;

      const variant = await prisma.productVariant.findFirst({
        where: {
          userId,
          barcode: { equals: barcode.trim(), mode: 'insensitive' },
          deletedAt: null,
        },
      });

      if (!variant) continue;

      const existingVariantMapping =
        await marketplaceProductMappingRepository.findByVariantAndAccount(
          variant.id,
          marketplaceAccountId,
        );
      const existingProductMapping =
        await marketplaceProductMappingRepository.findByProductAndAccount(
          marketplaceProductId,
          marketplaceAccountId,
        );

      if (existingVariantMapping || existingProductMapping) continue;

      candidates.push({
        marketplaceProductId,
        productVariantId: variant.id,
        confidence: BARCODE_CONFIDENCE,
        reason: 'barcode',
      });
    }

    return candidates;
  }
}

export const marketplaceAutoMatchService = new MarketplaceAutoMatchService();
