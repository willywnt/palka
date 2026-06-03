import type { MarketplaceMappingStatus, MarketplaceProvider } from '@prisma/client';

import type { TokenStatus } from '../utils/token-lifecycle';

export type MarketplaceConnectionStatus = 'connected' | 'disconnected' | 'expired';

export type MarketplaceConnectionListItem = {
  id: string;
  provider: MarketplaceProvider;
  shopId: string;
  shopName: string;
  isActive: boolean;
  tokenExpiresAt: string | null;
  tokenStatus: TokenStatus;
  connectionStatus: MarketplaceConnectionStatus;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceConnectionDetail = MarketplaceConnectionListItem;

export const MARKETPLACE_CONNECTION_STATUS_LABELS: Record<MarketplaceConnectionStatus, string> = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  expired: 'Token expired',
};

export type MarketplaceListingMapping = {
  variantId: string;
  variantSku: string;
  variantName: string;
  productName: string;
  syncEnabled: boolean;
  autoMapped: boolean;
  mappingStatus: MarketplaceMappingStatus;
};

export type MarketplaceSuggestedVariant = {
  id: string;
  sku: string;
  name: string;
  productName: string;
};

export type MarketplaceListingItem = {
  marketplaceProductId: string;
  externalProductId: string;
  externalVariantId: string;
  externalSku: string | null;
  externalProductName: string;
  externalVariantName: string | null;
  stock: number;
  status: string;
  lastImportedAt: string;
  mapping: MarketplaceListingMapping | null;
  /** Exact-SKU candidate offered for unmapped listings (one-click mapping). */
  suggestedVariant: MarketplaceSuggestedVariant | null;
};

export type ImportListingsResult = {
  imported: number;
  autoMapped: number;
};
