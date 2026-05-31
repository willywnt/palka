import type { MarketplaceMappingStatus, MarketplaceProvider } from '@prisma/client';

import type { MappingHealth } from '../domain/mapping-health';

export type MarketplaceProductListItemDto = {
  id: string;
  marketplaceAccountId: string;
  provider: MarketplaceProvider;
  externalProductId: string;
  externalVariantId: string;
  externalSku: string | null;
  externalProductName: string;
  externalVariantName: string | null;
  stock: number;
  status: string;
  mappingStatus: MarketplaceMappingStatus | 'UNMAPPED';
  internalSku: string | null;
  lastImportedAt: string;
  lastSyncedAt: string | null;
};

export type MarketplaceProductDetailDto = MarketplaceProductListItemDto & {
  rawPayload: Record<string, unknown> | null;
  storeName: string;
  mappings: Array<{
    id: string;
    internalSku: string;
    mappingStatus: MarketplaceMappingStatus;
    syncEnabled: boolean;
  }>;
};

export type ImportProductsResultDto = {
  imported: number;
  updated: number;
  autoMapped: number;
  unmapped: number;
  accountId: string;
};
