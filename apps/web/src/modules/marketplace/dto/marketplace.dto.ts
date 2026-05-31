import type { MarketplaceAccountStatus, MarketplaceProvider } from '@prisma/client';

import type { MarketplaceAccountHealth } from '../domain/account-health';
import type { TokenStatus } from '../utils/token-lifecycle';

export type MarketplaceAccountListItemDto = {
  id: string;
  provider: MarketplaceProvider;
  storeName: string;
  externalStoreId: string;
  status: MarketplaceAccountStatus;
  tokenExpiresAt: string | null;
  tokenStatus: TokenStatus;
  health: MarketplaceAccountHealth;
  connectMode: 'manual' | 'oauth' | null;
  lastConnectedAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceAccountDetailDto = MarketplaceAccountListItemDto;

export const MARKETPLACE_ACCOUNT_STATUS_LABELS: Record<MarketplaceAccountStatus, string> = {
  CONNECTED: 'Connected',
  EXPIRED: 'Token expired',
  DISCONNECTED: 'Disconnected',
  ERROR: 'Error',
  RECONNECT_REQUIRED: 'Reconnect required',
  SYNC_DISABLED: 'Sync disabled',
};

export const MARKETPLACE_ACCOUNT_STATUS_DESCRIPTIONS: Record<MarketplaceAccountStatus, string> = {
  CONNECTED: 'Store is connected and ready for sync workflows.',
  EXPIRED: 'Access token expired — reconnect to restore sync.',
  DISCONNECTED: 'Store was disconnected by an operator.',
  ERROR: 'Provider returned an error — check credentials and retry.',
  RECONNECT_REQUIRED: 'Provider requires re-authorization.',
  SYNC_DISABLED: 'Sync is paused for this store.',
};
