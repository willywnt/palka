import 'server-only';

import type { MarketplaceProvider } from '@prisma/client';

import { MarketplaceError } from '../errors/marketplace-errors';
import type {
  MarketplaceConnectParams,
  MarketplaceConnectResult,
  MarketplaceProviderAdapter,
  MarketplaceStoreInfo,
  MarketplaceValidationResult,
  ProviderRawTokenResponse,
  ProviderTokenExchangeParams,
} from '../domain/marketplace-provider.interface';
import type { BuildAuthorizationUrlParams } from '../providers/config/provider-config.types';
import type {
  NormalizedMarketplaceProduct,
  ProviderRawMarketplaceProduct,
} from '../domain/normalized-product.types';
import type {
  StockSyncValidation,
  StockUpdateParams,
  StockUpdateResult,
} from '../domain/stock-sync.types';
import { marketplaceProductNormalizer } from '../services/marketplace-product-normalizer';
import {
  getProviderOAuthConfig,
  requireConfiguredProviderOAuth,
} from '../providers/config/provider-config.registry';

/**
 * Base adapter with shared OAuth helpers. Subclasses override provider-specific API calls.
 */
export abstract class BaseMarketplaceProviderAdapter implements MarketplaceProviderAdapter {
  abstract readonly provider: MarketplaceProvider;

  buildAuthorizationUrl(params: BuildAuthorizationUrlParams): string {
    const config = requireConfiguredProviderOAuth(this.provider);
    const redirectUri = params.redirectUri ?? config.redirectUri;

    const url = new URL(config.authorizationUrl);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', params.state);

    if (config.scopes.length > 0) {
      url.searchParams.set('scope', config.scopes.join(' '));
    }

    return url.toString();
  }

  normalizeTokenPair(raw: ProviderRawTokenResponse) {
    const expiresAt =
      raw.expiresAt ?? (raw.expiresIn ? new Date(Date.now() + raw.expiresIn * 1000) : null);

    return {
      accessToken: raw.accessToken,
      refreshToken: raw.refreshToken ?? null,
      expiresAt,
    };
  }

  async connect(params: MarketplaceConnectParams): Promise<MarketplaceConnectResult> {
    if (!params.accessToken) {
      throw MarketplaceError.validation(
        `${this.provider} manual connect requires an access token.`,
      );
    }

    if (!params.externalStoreId || !params.storeName) {
      throw MarketplaceError.validation('Store ID and store name are required.');
    }

    return {
      accessToken: params.accessToken,
      refreshToken: params.refreshToken ?? null,
      expiresAt: params.expiresAt ?? null,
      store: {
        externalStoreId: params.externalStoreId,
        storeName: params.storeName,
        metadata: { connectMode: 'manual' },
      },
    };
  }

  async exchangeToken(_params: ProviderTokenExchangeParams): Promise<ProviderRawTokenResponse> {
    const config = getProviderOAuthConfig(this.provider);

    if (!config.configured) {
      throw MarketplaceError.oauthNotConfigured(this.provider);
    }

    throw MarketplaceError.providerExchangeFailed(
      `${this.provider} token exchange HTTP client is not wired yet.`,
    );
  }

  async refreshToken(_refreshToken: string): Promise<ProviderRawTokenResponse> {
    const config = getProviderOAuthConfig(this.provider);

    if (!config.configured) {
      throw MarketplaceError.oauthNotConfigured(this.provider);
    }

    throw MarketplaceError.providerExchangeFailed(
      `${this.provider} token refresh HTTP client is not wired yet.`,
    );
  }

  async validateConnection(accessToken: string): Promise<MarketplaceValidationResult> {
    if (!accessToken.trim()) {
      return { valid: false, errorMessage: 'Access token is empty.' };
    }

    const config = getProviderOAuthConfig(this.provider);

    if (!config.configured) {
      return { valid: true };
    }

    try {
      const store = await this.getStoreInfo(accessToken);
      return { valid: true, store };
    } catch (error) {
      return {
        valid: false,
        errorMessage: error instanceof Error ? error.message : 'Provider validation failed.',
      };
    }
  }

  async disconnect(): Promise<void> {
    // Best-effort no-op until provider revoke APIs are wired.
  }

  async getStoreInfo(_accessToken: string): Promise<MarketplaceStoreInfo> {
    throw MarketplaceError.providerExchangeFailed(
      `${this.provider} store info API is not wired yet.`,
    );
  }

  async fetchProducts(_accessToken: string): Promise<ProviderRawMarketplaceProduct[]> {
    throw MarketplaceError.validation(`${this.provider} product import API is not wired yet.`);
  }

  normalizeProduct(raw: ProviderRawMarketplaceProduct): NormalizedMarketplaceProduct | null {
    return marketplaceProductNormalizer.normalize(this.provider, raw);
  }

  async updateStock(_params: StockUpdateParams): Promise<StockUpdateResult> {
    throw MarketplaceError.validation(`${this.provider} stock update API is not wired yet.`);
  }

  async validateStockSync(accessToken: string): Promise<StockSyncValidation> {
    if (!accessToken.trim()) {
      return { ready: false, reason: 'Access token is empty.' };
    }

    return {
      ready: false,
      reason: `${this.provider} stock sync API is not wired yet.`,
    };
  }
}
