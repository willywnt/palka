import 'server-only';

import { MarketplaceProvider } from '@prisma/client';

import { BaseMarketplaceProviderAdapter } from '../base.provider';
import type { ProviderRawTokenResponse } from '../../domain/marketplace-provider.interface';
import type { MarketplaceStoreInfo } from '../../domain/marketplace-provider.interface';
import { MarketplaceError } from '../../errors/marketplace-errors';
import { requireConfiguredProviderOAuth } from '../config/provider-config.registry';

/** Tokopedia Open API adapter — OAuth URL + token exchange contract. */
export class TokopediaMarketplaceProvider extends BaseMarketplaceProviderAdapter {
  readonly provider = MarketplaceProvider.TOKOPEDIA;

  override async exchangeToken(params: {
    authorizationCode: string;
    redirectUri: string;
  }): Promise<ProviderRawTokenResponse> {
    const config = requireConfiguredProviderOAuth(this.provider);

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.authorizationCode,
      redirect_uri: params.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      throw MarketplaceError.providerExchangeFailed(
        `Tokopedia token exchange failed (${response.status}).`,
      );
    }

    const payload: unknown = await response.json();
    const parsed = parseTokopediaTokenResponse(payload);

    if (!parsed) {
      throw MarketplaceError.providerExchangeFailed(
        'Tokopedia returned an invalid token response.',
      );
    }

    return parsed;
  }

  override async getStoreInfo(accessToken: string): Promise<MarketplaceStoreInfo> {
    if (!accessToken.trim()) {
      throw MarketplaceError.invalidToken('Tokopedia access token is empty.');
    }

    return {
      externalStoreId: 'pending-tokopedia-shop',
      storeName: 'Tokopedia Store',
      metadata: { validationMode: 'placeholder' },
    };
  }
}

function parseTokopediaTokenResponse(body: unknown): ProviderRawTokenResponse | null {
  if (!body || typeof body !== 'object') return null;

  const record = body as Record<string, unknown>;
  const accessToken = typeof record.access_token === 'string' ? record.access_token : null;

  if (!accessToken) return null;

  const refreshToken = typeof record.refresh_token === 'string' ? record.refresh_token : null;
  const expiresIn = typeof record.expires_in === 'number' ? record.expires_in : null;

  return {
    accessToken,
    refreshToken,
    expiresIn,
    raw: record,
  };
}

export const tokopediaMarketplaceProvider = new TokopediaMarketplaceProvider();
