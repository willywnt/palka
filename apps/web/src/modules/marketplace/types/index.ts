export type { TokenStatus } from '../utils/token-lifecycle';
export type { MarketplaceAccountHealth, MarketplaceHealthIssue } from '../domain/account-health';

export type MarketplaceProviderCapabilities = {
  supportsOAuth: boolean;
  supportsRefresh: boolean;
  supportsWebhooks: boolean;
  connectable: boolean;
};

export {
  type MarketplaceAccountListItemDto,
  type MarketplaceAccountDetailDto,
  MARKETPLACE_ACCOUNT_STATUS_LABELS,
  MARKETPLACE_ACCOUNT_STATUS_DESCRIPTIONS,
} from '../dto/marketplace.dto';

/** @deprecated Use MarketplaceAccountListItemDto */
export type { MarketplaceAccountListItemDto as MarketplaceConnectionListItem } from '../dto/marketplace.dto';

/** @deprecated Use MarketplaceAccountDetailDto */
export type { MarketplaceAccountDetailDto as MarketplaceConnectionDetail } from '../dto/marketplace.dto';

/** @deprecated Use MarketplaceAccountStatus from Prisma */
export type MarketplaceConnectionStatus = 'connected' | 'disconnected' | 'expired';

/** @deprecated Use MARKETPLACE_ACCOUNT_STATUS_LABELS */
export const MARKETPLACE_CONNECTION_STATUS_LABELS = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  expired: 'Token expired',
} as const;
