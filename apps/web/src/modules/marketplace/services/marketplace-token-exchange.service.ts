import 'server-only';

import type { MarketplaceAccount, MarketplaceProvider } from '@prisma/client';
import { prisma } from '@olshop/db';

import {
  mergeAccountMetadata,
  parseAccountMetadata,
  toAccountMetadataJson,
} from '../domain/account-metadata';
import { reconcileAccountStatus } from '../domain/account-health';
import type { TokenExchangeInput } from '../domain/oauth.types';
import { toMarketplaceAccountDetailDto } from '../dto/marketplace.mappers';
import type { TokenExchangeResultDto } from '../dto/oauth.dto';
import { MarketplaceError } from '../errors/marketplace-errors';
import { getMarketplaceProviderAdapter } from '../providers';
import { getProviderOAuthConfig } from '../providers/config/provider-config.registry';
import { marketplaceAccountRepository } from '../repositories/marketplace-account.repository';
import { marketplaceEncryptionService } from './encryption.service';
import { appLogger } from '@/lib/logger';

/**
 * Centralized token exchange orchestration.
 * Providers perform HTTP exchange; this service validates, encrypts, and persists.
 */
export class MarketplaceTokenExchangeService {
  async exchangeAndPersist(input: TokenExchangeInput): Promise<TokenExchangeResultDto> {
    const adapter = getMarketplaceProviderAdapter(input.provider);
    const oauthConfig = getProviderOAuthConfig(input.provider);

    if (!oauthConfig.configured) {
      throw MarketplaceError.oauthNotConfigured(input.provider);
    }

    appLogger.info('marketplace.oauth.exchange_start', {
      userId: input.userId,
      provider: input.provider,
      mode: input.mode,
      accountId: input.accountId,
    });

    let raw;

    try {
      raw = await adapter.exchangeToken({
        authorizationCode: input.authorizationCode,
        redirectUri: input.redirectUri,
      });
    } catch (error) {
      appLogger.error('marketplace.oauth.exchange_failed', {
        userId: input.userId,
        provider: input.provider,
        error: error instanceof Error ? error.message : 'unknown',
      });

      if (input.accountId) {
        await this.recordValidationFailure(input.accountId, error);
      }

      throw error instanceof MarketplaceError
        ? error
        : MarketplaceError.providerExchangeFailed('Token exchange failed.');
    }

    const tokenPair = adapter.normalizeTokenPair(raw);

    let store;

    try {
      store = await adapter.getStoreInfo(tokenPair.accessToken);
    } catch {
      const shopId = raw.raw?.shop_id;

      store = {
        externalStoreId:
          typeof shopId === 'string' || typeof shopId === 'number'
            ? String(shopId)
            : `oauth-${input.provider.toLowerCase()}-${Date.now()}`,
        storeName: `${input.provider} Store`,
        metadata: { source: 'oauth_exchange_fallback' },
      };
    }

    const validation = await adapter.validateConnection(tokenPair.accessToken);

    if (!validation.valid) {
      if (input.accountId) {
        await marketplaceAccountRepository.updateStatus(input.accountId, 'RECONNECT_REQUIRED');
        await this.recordValidationFailure(input.accountId, validation.errorMessage);
      }

      throw MarketplaceError.reconnectRequired(
        validation.errorMessage ?? 'Provider rejected exchanged credentials.',
      );
    }

    if (validation.store) {
      store = validation.store;
    }

    const encryptedAccessToken = marketplaceEncryptionService.encryptToken(tokenPair.accessToken);
    const encryptedRefreshToken = tokenPair.refreshToken
      ? marketplaceEncryptionService.encryptToken(tokenPair.refreshToken)
      : null;

    const status = reconcileAccountStatus('CONNECTED', tokenPair.expiresAt ?? null);
    const nowIso = new Date().toISOString();

    const account = await prisma.$transaction(async (tx) => {
      let saved: MarketplaceAccount;

      if (input.mode === 'reconnect' && input.accountId) {
        const existing = await marketplaceAccountRepository.findByIdForUser(
          input.userId,
          input.accountId,
        );

        if (!existing) {
          throw MarketplaceError.notFound();
        }

        saved = await marketplaceAccountRepository.updateTokens(
          existing.id,
          {
            storeName: store.storeName,
            encryptedAccessToken,
            encryptedRefreshToken,
            tokenExpiresAt: tokenPair.expiresAt ?? null,
            status,
            lastConnectedAt: new Date(),
            metadata: toAccountMetadataJson(
              mergeAccountMetadata(existing.metadata, {
                reconnectMode: 'oauth',
                oauthReconnectedAt: nowIso,
                lastValidatedAt: nowIso,
                refreshFailureCount: 0,
                lastRefreshError: undefined,
                lastValidationError: undefined,
                providerMetadata: store.metadata,
              }),
            ),
          },
          tx,
        );
      } else {
        const existing = await marketplaceAccountRepository.findByProviderStore(
          input.userId,
          input.provider,
          store.externalStoreId,
        );

        if (existing?.status === 'CONNECTED') {
          throw MarketplaceError.duplicateAccount();
        }

        if (existing) {
          saved = await marketplaceAccountRepository.updateTokens(
            existing.id,
            {
              storeName: store.storeName,
              encryptedAccessToken,
              encryptedRefreshToken,
              tokenExpiresAt: tokenPair.expiresAt ?? null,
              status,
              lastConnectedAt: new Date(),
              metadata: toAccountMetadataJson(
                mergeAccountMetadata(existing.metadata, {
                  connectMode: 'oauth',
                  oauthConnectedAt: nowIso,
                  lastValidatedAt: nowIso,
                  refreshFailureCount: 0,
                  providerMetadata: store.metadata,
                }),
              ),
            },
            tx,
          );
        } else {
          saved = await marketplaceAccountRepository.create(
            {
              userId: input.userId,
              provider: input.provider,
              storeName: store.storeName,
              externalStoreId: store.externalStoreId,
              encryptedAccessToken,
              encryptedRefreshToken,
              tokenExpiresAt: tokenPair.expiresAt ?? null,
              status,
              lastConnectedAt: new Date(),
              metadata: toAccountMetadataJson({
                connectMode: 'oauth',
                oauthConnectedAt: nowIso,
                lastValidatedAt: nowIso,
                refreshFailureCount: 0,
                providerMetadata: store.metadata,
              }),
            },
            tx,
          );
        }
      }

      await tx.auditLog.create({
        data: {
          userId: input.userId,
          action:
            input.mode === 'reconnect'
              ? 'marketplace.account.oauth_reconnected'
              : 'marketplace.account.oauth_connected',
          resource: 'marketplace_account',
          metadata: {
            accountId: saved.id,
            provider: saved.provider,
            externalStoreId: saved.externalStoreId,
            storeName: saved.storeName,
          },
        },
      });

      return saved;
    });

    appLogger.info('marketplace.oauth.exchange_success', {
      userId: input.userId,
      accountId: account.id,
      provider: account.provider,
      mode: input.mode,
    });

    return {
      account: toMarketplaceAccountDetailDto(account),
      mode: input.mode,
    };
  }

  private async recordValidationFailure(accountId: string, error: unknown) {
    const account = await marketplaceAccountRepository.findById(accountId);

    if (!account) return;

    const metadata = parseAccountMetadata(account.metadata);
    const failureCount = (metadata.refreshFailureCount ?? 0) + 1;

    await marketplaceAccountRepository.updateMetadata(
      accountId,
      toAccountMetadataJson(
        mergeAccountMetadata(account.metadata, {
          lastValidationError:
            error instanceof Error ? error.message : 'Provider validation failed.',
          refreshFailureCount: failureCount,
        }),
      ),
    );
  }
}

export const marketplaceTokenExchangeService = new MarketplaceTokenExchangeService();
