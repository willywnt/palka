import 'server-only';

import { prisma } from '@olshop/db';

import {
  mergeAccountMetadata,
  parseAccountMetadata,
  toAccountMetadataJson,
} from '../domain/account-metadata';
import { reconcileAccountStatus } from '../domain/account-health';
import type { TokenRefreshResult } from '../domain/oauth.types';
import { MarketplaceError } from '../errors/marketplace-errors';
import { getMarketplaceProviderAdapter } from '../providers';
import { getProviderOAuthConfig } from '../providers/config/provider-config.registry';
import { marketplaceAccountRepository } from '../repositories/marketplace-account.repository';
import { marketplaceEncryptionService } from './encryption.service';
import { appLogger } from '@/lib/logger';

const DEFAULT_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Token refresh orchestration — BullMQ workers will call these methods.
 */
export class MarketplaceTokenRefreshService {
  async refreshAccountTokens(accountId: string): Promise<TokenRefreshResult> {
    const account = await marketplaceAccountRepository.findById(accountId);

    if (!account) {
      throw MarketplaceError.notFound();
    }

    if (account.status === 'DISCONNECTED') {
      throw MarketplaceError.validation('Cannot refresh a disconnected account.');
    }

    const refreshToken = marketplaceEncryptionService.safeDecryptToken(
      account.encryptedRefreshToken,
    );

    if (!refreshToken) {
      await marketplaceAccountRepository.updateStatus(accountId, 'RECONNECT_REQUIRED');
      throw MarketplaceError.reconnectRequired('No refresh token available.');
    }

    const adapter = getMarketplaceProviderAdapter(account.provider);
    const oauthConfig = getProviderOAuthConfig(account.provider);

    if (!oauthConfig.configured) {
      throw MarketplaceError.oauthNotConfigured(account.provider);
    }

    appLogger.info('marketplace.token.refresh_start', {
      accountId,
      provider: account.provider,
    });

    try {
      const raw = await adapter.refreshToken(refreshToken);
      const tokenPair = adapter.normalizeTokenPair(raw);

      const encryptedAccessToken = marketplaceEncryptionService.encryptToken(tokenPair.accessToken);
      const encryptedRefreshToken = tokenPair.refreshToken
        ? marketplaceEncryptionService.encryptToken(tokenPair.refreshToken)
        : account.encryptedRefreshToken;

      const status = reconcileAccountStatus('CONNECTED', tokenPair.expiresAt ?? null);
      const nowIso = new Date().toISOString();

      const updated = await marketplaceAccountRepository.updateTokens(accountId, {
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt: tokenPair.expiresAt ?? null,
        status,
        metadata: toAccountMetadataJson(
          mergeAccountMetadata(account.metadata, {
            lastRefreshAt: nowIso,
            refreshFailureCount: 0,
            lastRefreshError: undefined,
            lastValidatedAt: nowIso,
          }),
        ),
      });

      appLogger.info('marketplace.token.refresh_success', {
        accountId,
        provider: account.provider,
      });

      return {
        accountId: updated.id,
        refreshed: true,
        expiresAt: updated.tokenExpiresAt?.toISOString() ?? null,
        status: updated.status,
      };
    } catch (error) {
      const metadata = parseAccountMetadata(account.metadata);
      const failureCount = (metadata.refreshFailureCount ?? 0) + 1;

      await marketplaceAccountRepository.updateTokens(accountId, {
        encryptedAccessToken: account.encryptedAccessToken,
        encryptedRefreshToken: account.encryptedRefreshToken,
        tokenExpiresAt: account.tokenExpiresAt,
        status: failureCount >= 3 ? 'RECONNECT_REQUIRED' : account.status,
        metadata: toAccountMetadataJson(
          mergeAccountMetadata(account.metadata, {
            refreshFailureCount: failureCount,
            lastRefreshError: error instanceof Error ? error.message : 'Refresh failed.',
          }),
        ),
      });

      appLogger.warn('marketplace.token.refresh_failed', {
        accountId,
        provider: account.provider,
        failureCount,
        error: error instanceof Error ? error.message : 'unknown',
      });

      throw error instanceof MarketplaceError
        ? error
        : MarketplaceError.providerExchangeFailed('Token refresh failed.');
    }
  }

  async findAccountsExpiringBefore(
    before = new Date(Date.now() + DEFAULT_REFRESH_WINDOW_MS),
    limit = 25,
  ) {
    return marketplaceAccountRepository.findExpiringBefore(before, limit);
  }

  /** BullMQ-ready batch refresh — no scheduler wired yet. */
  async refreshExpiringAccounts(options?: { batchSize?: number; dryRun?: boolean }) {
    const batchSize = options?.batchSize ?? 25;
    const accounts = await this.findAccountsExpiringBefore(undefined, batchSize);
    const results: TokenRefreshResult[] = [];

    for (const account of accounts) {
      if (options?.dryRun) {
        results.push({
          accountId: account.id,
          refreshed: false,
          expiresAt: account.tokenExpiresAt?.toISOString() ?? null,
          status: account.status,
        });
        continue;
      }

      try {
        const result = await this.refreshAccountTokens(account.id);
        results.push(result);
      } catch {
        results.push({
          accountId: account.id,
          refreshed: false,
          expiresAt: account.tokenExpiresAt?.toISOString() ?? null,
          status: account.status,
        });
      }
    }

    appLogger.info('marketplace.token.refresh_batch_complete', {
      processed: accounts.length,
      refreshed: results.filter((item) => item.refreshed).length,
      dryRun: options?.dryRun ?? false,
    });

    return results;
  }
}

export const marketplaceTokenRefreshService = new MarketplaceTokenRefreshService();
