import 'server-only';

import type { MarketplaceProvider } from '@prisma/client';

import type { OAuthCallbackResult, OAuthStartResult } from '../domain/oauth.types';
import { MarketplaceError } from '../errors/marketplace-errors';
import { getMarketplaceProviderAdapter } from '../providers';
import { getProviderOAuthConfig } from '../providers/config/provider-config.registry';
import { marketplaceAccountRepository } from '../repositories/marketplace-account.repository';
import { marketplaceOAuthStateService } from './oauth-state.service';
import { marketplaceTokenExchangeService } from './marketplace-token-exchange.service';
import {
  getProviderCapabilities,
  isConnectableMarketplaceProvider,
  isSupportedMarketplaceProvider,
} from './provider.registry';
import { appLogger } from '@/lib/logger';

const DEFAULT_RETURN_URL = '/dashboard/marketplace';

export class MarketplaceOAuthService {
  async startOAuthFlow(input: {
    userId: string;
    provider: MarketplaceProvider;
    returnUrl?: string;
    accountId?: string;
  }): Promise<OAuthStartResult & { oauthConfigured: boolean }> {
    if (!isSupportedMarketplaceProvider(input.provider)) {
      throw MarketplaceError.invalidProvider();
    }

    if (!isConnectableMarketplaceProvider(input.provider)) {
      throw MarketplaceError.validation(`${input.provider} connect is not enabled yet.`);
    }

    const oauthConfig = getProviderOAuthConfig(input.provider);
    const mode = input.accountId ? 'reconnect' : 'connect';

    if (mode === 'reconnect' && input.accountId) {
      const account = await marketplaceAccountRepository.findByIdForUser(
        input.userId,
        input.accountId,
      );

      if (!account) {
        throw MarketplaceError.notFound();
      }

      if (account.provider !== input.provider) {
        throw MarketplaceError.validation('Account provider mismatch.');
      }
    }

    const returnUrl = input.returnUrl ?? DEFAULT_RETURN_URL;
    const state = marketplaceOAuthStateService.createState({
      userId: input.userId,
      provider: input.provider,
      mode,
      returnUrl,
      accountId: input.accountId,
    });

    const adapter = getMarketplaceProviderAdapter(input.provider);

    let authorizationUrl: string | null = null;

    if (oauthConfig.configured) {
      authorizationUrl = adapter.buildAuthorizationUrl({
        state,
        redirectUri: oauthConfig.redirectUri,
      });
    }

    appLogger.info('marketplace.oauth.start', {
      userId: input.userId,
      provider: input.provider,
      mode,
      oauthConfigured: oauthConfig.configured,
    });

    if (!authorizationUrl) {
      throw MarketplaceError.oauthNotConfigured(input.provider);
    }

    return {
      provider: input.provider,
      state,
      authorizationUrl,
      mode,
      oauthConfigured: oauthConfig.configured,
    };
  }

  async completeOAuthCallback(input: {
    provider: MarketplaceProvider;
    authorizationCode: string;
    state: string;
    providerError?: string;
    providerErrorDescription?: string;
  }): Promise<OAuthCallbackResult> {
    if (input.providerError) {
      throw MarketplaceError.oauthCallbackError(
        input.providerErrorDescription ?? input.providerError,
      );
    }

    const stateContext = marketplaceOAuthStateService.consumeState(input.state);

    if (!stateContext) {
      throw MarketplaceError.invalidOAuthState();
    }

    if (stateContext.provider !== input.provider) {
      throw MarketplaceError.invalidOAuthState();
    }

    const oauthConfig = getProviderOAuthConfig(input.provider);

    const result = await marketplaceTokenExchangeService.exchangeAndPersist({
      userId: stateContext.userId,
      provider: input.provider,
      authorizationCode: input.authorizationCode,
      redirectUri: oauthConfig.redirectUri,
      mode: stateContext.mode,
      accountId: stateContext.accountId,
    });

    appLogger.info('marketplace.oauth.callback_complete', {
      userId: stateContext.userId,
      provider: input.provider,
      accountId: result.account.id,
      mode: stateContext.mode,
    });

    return {
      provider: input.provider,
      mode: stateContext.mode,
      accountId: result.account.id,
      storeName: result.account.storeName,
      returnUrl: stateContext.returnUrl,
      status: stateContext.mode === 'reconnect' ? 'reconnected' : 'connected',
    };
  }

  getProviderOAuthStatus(provider: MarketplaceProvider) {
    const oauthConfig = getProviderOAuthConfig(provider);
    const capabilities = getProviderCapabilities(provider);

    return {
      provider,
      oauthConfigured: oauthConfig.configured,
      supportsOAuth: capabilities.supportsOAuth,
      connectable: capabilities.connectable,
    };
  }
}

export const marketplaceOAuthService = new MarketplaceOAuthService();
