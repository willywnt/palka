import 'server-only';

import { MarketplaceProvider } from '@prisma/client';
import { serverEnv } from '@olshop/config/env.server';

import { MarketplaceError } from '../../errors/marketplace-errors';
import type { MarketplaceProviderOAuthConfig } from './provider-config.types';

function resolveOAuthCallbackBaseUrl(): string {
  const base =
    process.env.MARKETPLACE_OAUTH_CALLBACK_BASE_URL ??
    serverEnv.AUTH_URL ??
    serverEnv.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://localhost:3000';

  return base.replace(/\/$/, '');
}

export function buildMarketplaceOAuthRedirectUri(provider: MarketplaceProvider): string {
  return `${resolveOAuthCallbackBaseUrl()}/api/v1/marketplaces/oauth/${provider.toLowerCase()}/callback`;
}

function buildShopeeConfig(): MarketplaceProviderOAuthConfig {
  const clientId = serverEnv.SHOPEE_PARTNER_ID ?? '';
  const clientSecret = serverEnv.SHOPEE_PARTNER_KEY ?? '';
  const configured = Boolean(clientId && clientSecret);

  return {
    provider: MarketplaceProvider.SHOPEE,
    clientId,
    clientSecret,
    authorizationUrl: 'https://partner.shopeemobile.com/api/v2/shop/auth_partner',
    tokenUrl: 'https://partner.shopeemobile.com/api/v2/auth/token/get',
    redirectUri: buildMarketplaceOAuthRedirectUri(MarketplaceProvider.SHOPEE),
    scopes: ['shop'],
    configured,
  };
}

function buildTokopediaConfig(): MarketplaceProviderOAuthConfig {
  const clientId = serverEnv.TOKOPEDIA_CLIENT_ID ?? '';
  const clientSecret = serverEnv.TOKOPEDIA_CLIENT_SECRET ?? '';
  const configured = Boolean(clientId && clientSecret);

  return {
    provider: MarketplaceProvider.TOKOPEDIA,
    clientId,
    clientSecret,
    authorizationUrl: 'https://accounts.tokopedia.com/token/auth',
    tokenUrl: 'https://accounts.tokopedia.com/token',
    redirectUri: buildMarketplaceOAuthRedirectUri(MarketplaceProvider.TOKOPEDIA),
    scopes: ['openid', 'profile'],
    configured,
  };
}

function buildTikTokConfig(): MarketplaceProviderOAuthConfig {
  return {
    provider: MarketplaceProvider.TIKTOK,
    clientId: '',
    clientSecret: '',
    authorizationUrl: 'https://auth.tiktok-shops.com/oauth/authorize',
    tokenUrl: 'https://auth.tiktok-shops.com/api/v2/token/get',
    redirectUri: buildMarketplaceOAuthRedirectUri(MarketplaceProvider.TIKTOK),
    scopes: ['seller.shop.info'],
    configured: false,
  };
}

function buildLazadaConfig(): MarketplaceProviderOAuthConfig {
  return {
    provider: MarketplaceProvider.LAZADA,
    clientId: '',
    clientSecret: '',
    authorizationUrl: 'https://auth.lazada.com/oauth/authorize',
    tokenUrl: 'https://auth.lazada.com/rest/auth/token/create',
    redirectUri: buildMarketplaceOAuthRedirectUri(MarketplaceProvider.LAZADA),
    scopes: ['read_products'],
    configured: false,
  };
}

export const MARKETPLACE_PROVIDER_OAUTH_CONFIG: Record<
  MarketplaceProvider,
  MarketplaceProviderOAuthConfig
> = {
  SHOPEE: buildShopeeConfig(),
  TOKOPEDIA: buildTokopediaConfig(),
  TIKTOK: buildTikTokConfig(),
  LAZADA: buildLazadaConfig(),
};

export function getProviderOAuthConfig(
  provider: MarketplaceProvider,
): MarketplaceProviderOAuthConfig {
  return MARKETPLACE_PROVIDER_OAUTH_CONFIG[provider];
}

export function requireConfiguredProviderOAuth(
  provider: MarketplaceProvider,
): MarketplaceProviderOAuthConfig {
  const config = getProviderOAuthConfig(provider);

  if (!config.configured) {
    throw MarketplaceError.oauthNotConfigured(provider);
  }

  return config;
}
