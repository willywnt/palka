import type { MarketplaceAccount } from '@prisma/client';

import { resolveAccountHealth } from '../domain/account-health';
import { parseAccountMetadata } from '../domain/account-metadata';
import type {
  MarketplaceAccountDetailDto,
  MarketplaceAccountListItemDto,
} from '../dto/marketplace.dto';
import { getTokenStatus } from '../utils/token-lifecycle';

export function toMarketplaceAccountListItemDto(
  account: MarketplaceAccount,
): MarketplaceAccountListItemDto {
  const health = resolveAccountHealth(account.status, account.tokenExpiresAt, account.metadata);

  return {
    id: account.id,
    provider: account.provider,
    storeName: account.storeName,
    externalStoreId: account.externalStoreId,
    status: health.status,
    tokenExpiresAt: account.tokenExpiresAt?.toISOString() ?? null,
    tokenStatus: getTokenStatus(account.tokenExpiresAt),
    health,
    connectMode: parseAccountMetadata(account.metadata).connectMode ?? null,
    lastConnectedAt: account.lastConnectedAt?.toISOString() ?? null,
    lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

export function toMarketplaceAccountDetailDto(
  account: MarketplaceAccount,
): MarketplaceAccountDetailDto {
  return toMarketplaceAccountListItemDto(account);
}
