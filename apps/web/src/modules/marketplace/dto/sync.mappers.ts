import type { MarketplaceSyncJobStatus } from '@prisma/client';

import { resolveSyncHealth } from '../domain/sync-health';
import type { MarketplaceSyncJobDetailDto, MarketplaceSyncJobListItemDto } from './sync.dto';

type SyncJobRow = {
  id: string;
  marketplaceAccountId: string;
  marketplaceProductMappingId: string;
  provider: MarketplaceSyncJobListItemDto['provider'];
  syncType: string;
  syncStatus: MarketplaceSyncJobStatus;
  payload: unknown;
  providerResponse: unknown;
  attempts: number;
  errorMessage: string | null;
  lastAttemptAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  mapping: {
    syncEnabled: boolean;
    productVariant: { sku: string; name: string };
    marketplaceProduct: { externalSku: string | null; externalProductName: string };
  };
  marketplaceAccount: {
    id: string;
    storeName: string;
    provider: MarketplaceSyncJobListItemDto['provider'];
    status?: string;
    tokenExpiresAt?: Date | null;
    providerHealth?: {
      consecutiveFailures: number;
      lastSuccessAt: Date | null;
    } | null;
  };
};

function toHealth(row: SyncJobRow): MarketplaceSyncJobListItemDto['health'] {
  return resolveSyncHealth({
    syncStatus: row.syncStatus,
    mappingSyncEnabled: row.mapping.syncEnabled,
    accountStatus: row.marketplaceAccount.status ?? 'CONNECTED',
    tokenExpiresAt: row.marketplaceAccount.tokenExpiresAt ?? null,
    consecutiveFailures: row.marketplaceAccount.providerHealth?.consecutiveFailures ?? 0,
    lastSuccessAt: row.marketplaceAccount.providerHealth?.lastSuccessAt ?? null,
  });
}

export function toMarketplaceSyncJobListItemDto(row: SyncJobRow): MarketplaceSyncJobListItemDto {
  return {
    id: row.id,
    marketplaceAccountId: row.marketplaceAccountId,
    storeName: row.marketplaceAccount.storeName,
    provider: row.provider,
    mappingId: row.marketplaceProductMappingId,
    internalSku: row.mapping.productVariant.sku,
    externalSku: row.mapping.marketplaceProduct.externalSku,
    syncStatus: row.syncStatus,
    syncType: row.syncType,
    attempts: row.attempts,
    errorMessage: row.errorMessage,
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    health: toHealth(row),
  };
}

export function toMarketplaceSyncJobDetailDto(row: SyncJobRow): MarketplaceSyncJobDetailDto {
  return {
    ...toMarketplaceSyncJobListItemDto(row),
    payload:
      row.payload && typeof row.payload === 'object'
        ? (row.payload as Record<string, unknown>)
        : null,
    providerResponse:
      row.providerResponse && typeof row.providerResponse === 'object'
        ? (row.providerResponse as Record<string, unknown>)
        : null,
    productName: row.mapping.marketplaceProduct.externalProductName,
  };
}
