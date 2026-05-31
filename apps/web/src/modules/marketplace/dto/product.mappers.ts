import type { MarketplaceProduct } from '@prisma/client';

import type { MarketplaceProductDetailDto, MarketplaceProductListItemDto } from './product.dto';

type ProductWithMappings = MarketplaceProduct & {
  mappings?: Array<{
    id: string;
    mappingStatus: string;
    syncEnabled: boolean;
    productVariant?: { sku: string; name: string } | null;
  }>;
  marketplaceAccount?: { storeName: string };
};

export function toMarketplaceProductListItemDto(
  product: ProductWithMappings,
): MarketplaceProductListItemDto {
  const activeMapping = product.mappings?.find((m) => !('deletedAt' in m)) ?? product.mappings?.[0];

  return {
    id: product.id,
    marketplaceAccountId: product.marketplaceAccountId,
    provider: product.provider,
    externalProductId: product.externalProductId,
    externalVariantId: product.externalVariantId,
    externalSku: product.externalSku,
    externalProductName: product.externalProductName,
    externalVariantName: product.externalVariantName,
    stock: product.stock,
    status: product.status,
    mappingStatus: activeMapping
      ? (activeMapping.mappingStatus as MarketplaceProductListItemDto['mappingStatus'])
      : 'UNMAPPED',
    internalSku: activeMapping?.productVariant?.sku ?? null,
    lastImportedAt: product.lastImportedAt.toISOString(),
    lastSyncedAt: product.lastSyncedAt?.toISOString() ?? null,
  };
}

export function toMarketplaceProductDetailDto(
  product: ProductWithMappings,
): MarketplaceProductDetailDto {
  const base = toMarketplaceProductListItemDto(product);

  return {
    ...base,
    rawPayload: (product.rawPayload as Record<string, unknown> | null) ?? null,
    storeName: product.marketplaceAccount?.storeName ?? '',
    mappings:
      product.mappings?.map((mapping) => ({
        id: mapping.id,
        internalSku: mapping.productVariant?.sku ?? '',
        mappingStatus:
          mapping.mappingStatus as MarketplaceProductDetailDto['mappings'][0]['mappingStatus'],
        syncEnabled: mapping.syncEnabled,
      })) ?? [],
  };
}
