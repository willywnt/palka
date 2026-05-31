import 'server-only';

import { createHmac } from 'node:crypto';

import { MarketplaceProvider } from '@prisma/client';

import { BaseMarketplaceProviderAdapter } from '../base.provider';
import type { ProviderRawTokenResponse } from '../../domain/marketplace-provider.interface';
import type { MarketplaceStoreInfo } from '../../domain/marketplace-provider.interface';
import { MarketplaceError } from '../../errors/marketplace-errors';
import { requireConfiguredProviderOAuth } from '../config/provider-config.registry';

/** Shopee Open Platform adapter — OAuth URL + token exchange contract. */
export class ShopeeMarketplaceProvider extends BaseMarketplaceProviderAdapter {
  readonly provider = MarketplaceProvider.SHOPEE;

  override async exchangeToken(params: {
    authorizationCode: string;
    redirectUri: string;
  }): Promise<ProviderRawTokenResponse> {
    const config = requireConfiguredProviderOAuth(this.provider);
    const timestamp = Math.floor(Date.now() / 1000);
    const path = '/api/v2/auth/token/get';
    const baseString = `${config.clientId}${path}${timestamp}`;
    const sign = createHmac('sha256', config.clientSecret).update(baseString).digest('hex');

    const url = new URL(config.tokenUrl);
    url.searchParams.set('partner_id', config.clientId);
    url.searchParams.set('timestamp', String(timestamp));
    url.searchParams.set('sign', sign);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: params.authorizationCode,
        shop_id: undefined,
        partner_id: Number(config.clientId),
      }),
    });

    if (!response.ok) {
      throw MarketplaceError.providerExchangeFailed(
        `Shopee token exchange failed (${response.status}).`,
      );
    }

    const body: unknown = await response.json();
    const parsed = parseShopeeTokenResponse(body);

    if (!parsed) {
      throw MarketplaceError.providerExchangeFailed('Shopee returned an invalid token response.');
    }

    return parsed;
  }

  override async getStoreInfo(accessToken: string): Promise<MarketplaceStoreInfo> {
    if (!accessToken.trim()) {
      throw MarketplaceError.invalidToken('Shopee access token is empty.');
    }

    return {
      externalStoreId: 'pending-shopee-shop',
      storeName: 'Shopee Store',
      metadata: { validationMode: 'placeholder' },
    };
  }
}

function parseShopeeTokenResponse(body: unknown): ProviderRawTokenResponse | null {
  if (!body || typeof body !== 'object') return null;

  const record = body as Record<string, unknown>;
  const data =
    record.response && typeof record.response === 'object'
      ? (record.response as Record<string, unknown>)
      : record;

  const accessToken =
    typeof data.access_token === 'string'
      ? data.access_token
      : typeof data.accessToken === 'string'
        ? data.accessToken
        : null;

  if (!accessToken) return null;

  const refreshToken =
    typeof data.refresh_token === 'string'
      ? data.refresh_token
      : typeof data.refreshToken === 'string'
        ? data.refreshToken
        : null;

  const expireIn =
    typeof data.expire_in === 'number'
      ? data.expire_in
      : typeof data.expires_in === 'number'
        ? data.expires_in
        : null;

  return {
    accessToken,
    refreshToken,
    expiresIn: expireIn,
    raw: record as Record<string, unknown>,
  };
}

export const shopeeMarketplaceProvider = new ShopeeMarketplaceProvider();
