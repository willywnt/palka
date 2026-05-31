import type { MarketplaceMappingStatus, MarketplaceProvider } from '@prisma/client';

import type { MappingHealth } from '../domain/mapping-health';

export type MarketplaceMappingListItemDto = {
  id: string;
  marketplaceAccountId: string;
  provider: MarketplaceProvider;
  storeName: string;
  mappingStatus: MarketplaceMappingStatus;
  syncEnabled: boolean;
  autoMapped: boolean;
  mappingConfidence: number | null;
  health: MappingHealth;
  internalSku: string;
  internalVariantName: string;
  externalSku: string | null;
  externalProductName: string;
  externalVariantName: string | null;
  marketplaceStock: number;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceMappingDetailDto = MarketplaceMappingListItemDto;

export const MAPPING_STATUS_LABELS: Record<MarketplaceMappingStatus, string> = {
  MAPPED: 'Mapped',
  UNMAPPED: 'Unmapped',
  BROKEN: 'Broken',
  CONFLICT: 'Conflict',
  SYNC_DISABLED: 'Sync disabled',
};
