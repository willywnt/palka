import type { MarketplaceSyncJobStatus, MarketplaceProvider } from '@prisma/client';

import type { SyncHealth } from '../domain/sync-health';

export type MarketplaceSyncJobListItemDto = {
  id: string;
  marketplaceAccountId: string;
  storeName: string;
  provider: MarketplaceProvider;
  mappingId: string;
  internalSku: string;
  externalSku: string | null;
  syncStatus: MarketplaceSyncJobStatus;
  syncType: string;
  attempts: number;
  errorMessage: string | null;
  lastAttemptAt: string | null;
  completedAt: string | null;
  createdAt: string;
  health: SyncHealth;
};

export type MarketplaceSyncJobDetailDto = MarketplaceSyncJobListItemDto & {
  payload: Record<string, unknown> | null;
  providerResponse: Record<string, unknown> | null;
  productName: string | null;
};

export type MarketplaceSyncOverviewDto = {
  pending: number;
  success: number;
  failed: number;
  retrying: number;
  queueWaiting: number;
  queueActive: number;
  queueFailed: number;
  providerHealth: Array<{
    accountId: string;
    storeName: string;
    provider: MarketplaceProvider;
    consecutiveFailures: number;
    averageLatencyMs: number | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    tokenValid: boolean;
  }>;
};
