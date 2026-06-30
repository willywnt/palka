import 'server-only';

import { getServerEnv } from '@palka/config/env.server';
import {
  buildShopeeAuthUrl,
  createShopeeClient,
  exchangeShopeeCode,
  isShopeeSuccess,
  refreshShopeeToken,
} from '@palka/marketplace-providers';
import { MarketplaceProvider } from '@prisma/client';

import { appLogger } from '@/lib/logger';

import { MarketplaceError } from '../errors/marketplace-errors';
import { decodeOAuthState, encodeOAuthState } from '../utils/oauth-state';
import { marketplaceServerService } from './marketplace-server.service';

const DEFAULT_BASE_URL = 'https://partner.shopeemobile.com';
const SHOP_INFO_PATH = '/api/v2/shop/get_shop_info';

/**
 * Shopee OAuth onboarding (multi-shop). Shopee has no `state` param, so the authorize URL
 * carries our encrypted state INSIDE the redirect URL (Shopee appends `code` + `shop_id` to
 * it). The callback swaps the code (+ shop_id) for tokens and creates the org-scoped
 * connection. Mirrors {@link lazadaOAuthService}; reuses the shared OAuth-state helpers.
 *
 * ⚠ Verify against the live Shopee console once sandbox access lands — the auth_partner /
 * token/get / get_shop_info paths and the token field names are the v2 contract.
 */
class ShopeeOAuthService {
  /** Build the signed shop-authorization URL (state encrypts org + actor, carried in redirect). */
  buildAuthorizeUrl(input: { organizationId: string; actorUserId: string }): string {
    const env = getServerEnv();
    if (!env.SHOPEE_PARTNER_ID || !env.SHOPEE_PARTNER_KEY || !env.SHOPEE_OAUTH_REDIRECT_URI) {
      throw MarketplaceError.validation(
        'Shopee OAuth belum dikonfigurasi (SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY / SHOPEE_OAUTH_REDIRECT_URI).',
      );
    }

    const redirect = new URL(env.SHOPEE_OAUTH_REDIRECT_URI);
    redirect.searchParams.set('state', encodeOAuthState(input, env.MARKETPLACE_ENCRYPTION_SECRET));

    return buildShopeeAuthUrl({
      baseUrl: env.SHOPEE_API_BASE_URL ?? DEFAULT_BASE_URL,
      partnerId: env.SHOPEE_PARTNER_ID,
      partnerKey: env.SHOPEE_PARTNER_KEY,
      redirect: redirect.toString(),
    });
  }

  /** Exchange the callback code + shop_id (validating state) and create the org-scoped connection. */
  async handleCallback(input: {
    code: string;
    shopId: string;
    state: string;
  }): Promise<{ connectionId: string }> {
    const env = getServerEnv();
    const { organizationId, actorUserId } = decodeOAuthState(
      input.state,
      env.MARKETPLACE_ENCRYPTION_SECRET,
    );
    return this.createConnectionFromCode({
      organizationId,
      actorUserId,
      code: input.code,
      shopId: input.shopId,
    });
  }

  /**
   * Connect with a code + shop_id obtained OUT-OF-BAND, where the org/actor come from the
   * authenticated caller instead of an encrypted `state`. Notably for Shopee's sandbox console
   * "Authorize Test Partner" tool, which returns ?code&shop_id to the redirect WITHOUT our state.
   * Same trust model as {@link handleCallback} — the code still comes from Shopee's consent flow,
   * and the route gates the caller (marketplace.manage), so the connection lands on their own org.
   */
  async connectWithCode(input: {
    organizationId: string;
    actorUserId: string;
    code: string;
    shopId: string;
  }): Promise<{ connectionId: string }> {
    return this.createConnectionFromCode(input);
  }

  /** Exchange a Shopee auth code for tokens and upsert the org-scoped connection. */
  private async createConnectionFromCode(input: {
    organizationId: string;
    actorUserId: string;
    code: string;
    shopId: string;
  }): Promise<{ connectionId: string }> {
    const env = getServerEnv();
    if (!env.SHOPEE_PARTNER_ID || !env.SHOPEE_PARTNER_KEY) {
      throw MarketplaceError.validation('Kredensial app Shopee belum dikonfigurasi.');
    }

    const token = await exchangeShopeeCode({
      partnerId: env.SHOPEE_PARTNER_ID,
      partnerKey: env.SHOPEE_PARTNER_KEY,
      baseUrl: env.SHOPEE_API_BASE_URL ?? DEFAULT_BASE_URL,
      code: input.code,
      shopId: input.shopId,
    });

    const shopId = input.shopId || token.shopIdList[0] || 'shopee';
    const shopName = `Shopee ${shopId}`;
    const expiresAt = token.expiresIn > 0 ? new Date(Date.now() + token.expiresIn * 1000) : null;

    const connection = await marketplaceServerService.upsertOAuthConnection(
      input.organizationId,
      input.actorUserId,
      {
        provider: MarketplaceProvider.SHOPEE,
        shopId,
        shopName,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken || undefined,
        expiresAt,
      },
    );

    appLogger.info('marketplace.shopee.oauth.connected', {
      organizationId: input.organizationId,
      connectionId: connection.id,
      shopId,
    });

    return { connectionId: connection.id };
  }

  /** Renew a connection's access token from its stored refresh token (Shopee tokens last ~4h). */
  async refreshConnection(
    organizationId: string,
    actorUserId: string,
    connectionId: string,
  ): Promise<void> {
    const env = getServerEnv();
    if (!env.SHOPEE_PARTNER_ID || !env.SHOPEE_PARTNER_KEY) {
      throw MarketplaceError.validation('Kredensial app Shopee belum dikonfigurasi.');
    }

    const tokens = await marketplaceServerService.getDecryptedTokens(organizationId, connectionId);
    if (tokens.provider !== MarketplaceProvider.SHOPEE) {
      throw MarketplaceError.validation('Hanya koneksi Shopee yang didukung di sini.');
    }
    if (!tokens.refreshToken) {
      throw MarketplaceError.validation('Tidak ada refresh token tersimpan untuk koneksi ini.');
    }

    const refreshed = await refreshShopeeToken({
      partnerId: env.SHOPEE_PARTNER_ID,
      partnerKey: env.SHOPEE_PARTNER_KEY,
      baseUrl: env.SHOPEE_API_BASE_URL ?? DEFAULT_BASE_URL,
      refreshToken: tokens.refreshToken,
      shopId: tokens.shopId,
    });

    const expiresAt =
      refreshed.expiresIn > 0 ? new Date(Date.now() + refreshed.expiresIn * 1000) : null;

    await marketplaceServerService.applyRefreshedTokens(organizationId, actorUserId, connectionId, {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || null,
      expiresAt,
    });

    appLogger.info('marketplace.shopee.oauth.refreshed', { organizationId, connectionId });
  }

  /** Probe a connection's token with GET /shop/get_shop_info so the user can verify it. */
  async testConnection(
    organizationId: string,
    connectionId: string,
  ): Promise<{ ready: boolean; reason?: string }> {
    const env = getServerEnv();
    if (!env.SHOPEE_PARTNER_ID || !env.SHOPEE_PARTNER_KEY) {
      throw MarketplaceError.validation('Kredensial app Shopee belum dikonfigurasi.');
    }

    const tokens = await marketplaceServerService.getDecryptedTokens(organizationId, connectionId);
    if (tokens.provider !== MarketplaceProvider.SHOPEE) {
      throw MarketplaceError.validation('Hanya koneksi Shopee yang bisa dites di sini.');
    }

    const client = createShopeeClient({
      partnerId: env.SHOPEE_PARTNER_ID,
      partnerKey: env.SHOPEE_PARTNER_KEY,
      baseUrl: env.SHOPEE_API_BASE_URL ?? DEFAULT_BASE_URL,
    });
    const response = await client.call(SHOP_INFO_PATH, {
      method: 'GET',
      accessToken: tokens.accessToken,
      shopId: tokens.shopId,
    });

    return isShopeeSuccess(response)
      ? { ready: true }
      : { ready: false, reason: response.message ?? `Shopee error ${response.error}` };
  }
}

export const shopeeOAuthService = new ShopeeOAuthService();
