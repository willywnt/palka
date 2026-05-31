import type { MarketplaceProductMapping } from '@prisma/client';

import { resolveMappingHealth } from '../domain/mapping-health';
import type { MarketplaceMappingDetailDto, MarketplaceMappingListItemDto } from './mapping.dto';

type MappingRow = MarketplaceProductMapping & {
  productVariant: {
    id: string;
    sku: string;
    name: string;
    barcode: string | null;
    isActive: boolean;
    deletedAt?: Date | null;
  };
  marketplaceProduct: {
    id: string;
    externalSku: string | null;
    externalProductName: string;
    externalVariantName: string | null;
    stock: number;
    status: string;
    deletedAt?: Date | null;
  };
  marketplaceAccount: {
    id: string;
    storeName: string;
    provider: MarketplaceProductMapping['provider'];
  };
};

export function toMarketplaceMappingListItemDto(
  mapping: MappingRow,
): MarketplaceMappingListItemDto {
  const health = resolveMappingHealth({
    mappingStatus: mapping.mappingStatus,
    syncEnabled: mapping.syncEnabled,
    productDeleted: Boolean(mapping.marketplaceProduct.deletedAt),
    variantDeleted: Boolean(mapping.productVariant.deletedAt),
  });

  return {
    id: mapping.id,
    marketplaceAccountId: mapping.marketplaceAccountId,
    provider: mapping.provider,
    storeName: mapping.marketplaceAccount.storeName,
    mappingStatus: mapping.mappingStatus,
    syncEnabled: mapping.syncEnabled,
    autoMapped: mapping.autoMapped,
    mappingConfidence: mapping.mappingConfidence ? Number(mapping.mappingConfidence) : null,
    health,
    internalSku: mapping.productVariant.sku,
    internalVariantName: mapping.productVariant.name,
    externalSku: mapping.marketplaceProduct.externalSku,
    externalProductName: mapping.marketplaceProduct.externalProductName,
    externalVariantName: mapping.marketplaceProduct.externalVariantName,
    marketplaceStock: mapping.marketplaceProduct.stock,
    createdAt: mapping.createdAt.toISOString(),
    updatedAt: mapping.updatedAt.toISOString(),
  };
}

export function toMarketplaceMappingDetailDto(mapping: MappingRow): MarketplaceMappingDetailDto {
  return toMarketplaceMappingListItemDto(mapping);
}
