import type { MarketplaceProvider } from '@prisma/client';

import type { BuildAuthorizationUrlParams } from '../providers/config/provider-config.types';
import type {
  NormalizedMarketplaceProduct,
  ProviderRawMarketplaceProduct,
} from './normalized-product.types';
import type { StockSyncValidation, StockUpdateParams, StockUpdateResult } from './stock-sync.types';

export type MarketplaceTokenPair = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
};

export type MarketplaceStoreInfo = {
  externalStoreId: string;
  storeName: string;
  metadata?: Record<string, unknown>;
};

export type MarketplaceConnectParams = {
  authorizationCode?: string;
  redirectUri?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date | null;
  externalStoreId?: string;
  storeName?: string;
};

export type MarketplaceConnectResult = MarketplaceTokenPair & {
  store: MarketplaceStoreInfo;
};

export type MarketplaceValidationResult = {
  valid: boolean;
  store?: MarketplaceStoreInfo;
  errorMessage?: string;
};

export type ProviderTokenExchangeParams = {
  authorizationCode: string;
  redirectUri: string;
};

export type ProviderRawTokenResponse = {
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number | null;
  expiresAt?: Date | null;
  raw?: Record<string, unknown>;
};

/**
 * Provider adapter contract for marketplace integrations.
 * Business logic orchestrates adapters through services — never inline in routes.
 */
export interface MarketplaceProviderAdapter {
  readonly provider: MarketplaceProvider;

  buildAuthorizationUrl(params: BuildAuthorizationUrlParams): string;
  connect(params: MarketplaceConnectParams): Promise<MarketplaceConnectResult>;
  exchangeToken(params: ProviderTokenExchangeParams): Promise<ProviderRawTokenResponse>;
  refreshToken(refreshToken: string): Promise<ProviderRawTokenResponse>;
  validateConnection(accessToken: string): Promise<MarketplaceValidationResult>;
  disconnect(accessToken: string): Promise<void>;
  getStoreInfo(accessToken: string): Promise<MarketplaceStoreInfo>;
  normalizeTokenPair(raw: ProviderRawTokenResponse): MarketplaceTokenPair;
  fetchProducts(accessToken: string): Promise<ProviderRawMarketplaceProduct[]>;
  normalizeProduct(raw: ProviderRawMarketplaceProduct): NormalizedMarketplaceProduct | null;
  updateStock(params: StockUpdateParams): Promise<StockUpdateResult>;
  validateStockSync(accessToken: string): Promise<StockSyncValidation>;
}
