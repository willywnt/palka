import 'server-only';

import type { MarketplaceProvider } from '@prisma/client';
import { prisma } from '@olshop/db';

import { mergeAccountMetadata, toAccountMetadataJson } from '../domain/account-metadata';
import { reconcileAccountStatus } from '../domain/account-health';
import {
  toMarketplaceAccountDetailDto,
  toMarketplaceAccountListItemDto,
} from '../dto/marketplace.mappers';
import type {
  MarketplaceAccountDetailDto,
  MarketplaceAccountListItemDto,
} from '../dto/marketplace.dto';
import { MarketplaceError } from '../errors/marketplace-errors';
import { marketplaceAccountRepository } from '../repositories/marketplace-account.repository';
import { marketplaceEncryptionService } from './encryption.service';
import { getMarketplaceProviderAdapter } from '../providers';
import { isConnectableMarketplaceProvider } from './provider.registry';
import type { ConnectMarketplaceAccountInput } from '../validators/connect-account';
import type { ReconnectMarketplaceAccountInput } from '../validators/reconnect-account';
import { appLogger } from '@/lib/logger';

export class MarketplaceAccountService {
  async listAccounts(userId: string): Promise<MarketplaceAccountListItemDto[]> {
    const accounts = await marketplaceAccountRepository.findManyByUser(userId);
    return accounts.map(toMarketplaceAccountListItemDto);
  }

  async getAccountById(userId: string, accountId: string): Promise<MarketplaceAccountDetailDto> {
    const account = await this.getOwnedAccount(accountId, userId);
    return toMarketplaceAccountDetailDto(account);
  }

  async connectAccount(
    userId: string,
    input: ConnectMarketplaceAccountInput,
  ): Promise<MarketplaceAccountDetailDto> {
    if (!isConnectableMarketplaceProvider(input.provider)) {
      throw MarketplaceError.invalidProvider();
    }

    const adapter = getMarketplaceProviderAdapter(input.provider);
    const connectResult = await adapter.connect({
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt: input.expiresAt,
      externalStoreId: input.externalStoreId,
      storeName: input.storeName,
    });

    const validation = await adapter.validateConnection(connectResult.accessToken);
    if (!validation.valid) {
      throw MarketplaceError.validation(
        validation.errorMessage ?? 'Provider rejected the supplied credentials.',
      );
    }

    const encryptedAccessToken = marketplaceEncryptionService.encryptToken(
      connectResult.accessToken,
    );
    const encryptedRefreshToken = connectResult.refreshToken
      ? marketplaceEncryptionService.encryptToken(connectResult.refreshToken)
      : null;

    const existing = await marketplaceAccountRepository.findByProviderStore(
      userId,
      input.provider,
      input.externalStoreId,
    );

    if (existing && existing.status === 'CONNECTED') {
      throw MarketplaceError.duplicateAccount();
    }

    const status = reconcileAccountStatus(
      'CONNECTED',
      connectResult.expiresAt ?? input.expiresAt ?? null,
    );

    const account = await prisma.$transaction(async (tx) => {
      let saved;

      if (existing) {
        saved = await marketplaceAccountRepository.updateTokens(
          existing.id,
          {
            storeName: input.storeName,
            encryptedAccessToken,
            encryptedRefreshToken,
            tokenExpiresAt: connectResult.expiresAt ?? input.expiresAt ?? null,
            status,
            lastConnectedAt: new Date(),
            metadata: { connectMode: 'manual', provider: input.provider },
          },
          tx,
        );
      } else {
        saved = await marketplaceAccountRepository.create(
          {
            userId,
            provider: input.provider as MarketplaceProvider,
            storeName: input.storeName,
            externalStoreId: input.externalStoreId,
            encryptedAccessToken,
            encryptedRefreshToken,
            tokenExpiresAt: connectResult.expiresAt ?? input.expiresAt ?? null,
            status,
            lastConnectedAt: new Date(),
            metadata: { connectMode: 'manual', provider: input.provider },
          },
          tx,
        );
      }

      await tx.auditLog.create({
        data: {
          userId,
          action: 'marketplace.account.connected',
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

    appLogger.info('marketplace.account.connected', {
      userId,
      accountId: account.id,
      provider: account.provider,
      externalStoreId: account.externalStoreId,
    });

    return toMarketplaceAccountDetailDto(account);
  }

  async reconnectAccount(
    userId: string,
    accountId: string,
    input: ReconnectMarketplaceAccountInput,
  ): Promise<MarketplaceAccountDetailDto> {
    const account = await this.getOwnedAccount(accountId, userId);
    const adapter = getMarketplaceProviderAdapter(account.provider);

    const connectResult = await adapter.connect({
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt: input.expiresAt,
      externalStoreId: account.externalStoreId,
      storeName: input.storeName ?? account.storeName,
    });

    const validation = await adapter.validateConnection(connectResult.accessToken);
    if (!validation.valid) {
      await marketplaceAccountRepository.updateStatus(accountId, 'RECONNECT_REQUIRED');
      throw MarketplaceError.validation(
        validation.errorMessage ?? 'Reconnect failed — credentials were rejected.',
      );
    }

    const encryptedAccessToken = marketplaceEncryptionService.encryptToken(
      connectResult.accessToken,
    );
    const encryptedRefreshToken = connectResult.refreshToken
      ? marketplaceEncryptionService.encryptToken(connectResult.refreshToken)
      : null;

    const status = reconcileAccountStatus(
      'CONNECTED',
      connectResult.expiresAt ?? input.expiresAt ?? null,
    );

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await marketplaceAccountRepository.updateTokens(
        accountId,
        {
          storeName: input.storeName ?? account.storeName,
          encryptedAccessToken,
          encryptedRefreshToken,
          tokenExpiresAt: connectResult.expiresAt ?? input.expiresAt ?? null,
          status,
          lastConnectedAt: new Date(),
          metadata: { reconnectMode: 'manual', reconnectedAt: new Date().toISOString() },
        },
        tx,
      );

      await tx.auditLog.create({
        data: {
          userId,
          action: 'marketplace.account.reconnected',
          resource: 'marketplace_account',
          metadata: {
            accountId: saved.id,
            provider: saved.provider,
            externalStoreId: saved.externalStoreId,
          },
        },
      });

      return saved;
    });

    appLogger.info('marketplace.account.reconnected', {
      userId,
      accountId: updated.id,
      provider: updated.provider,
    });

    return toMarketplaceAccountDetailDto(updated);
  }

  async disconnectAccount(userId: string, accountId: string): Promise<MarketplaceAccountDetailDto> {
    const account = await this.getOwnedAccount(accountId, userId);

    if (account.status === 'DISCONNECTED') {
      return toMarketplaceAccountDetailDto(account);
    }

    const adapter = getMarketplaceProviderAdapter(account.provider);

    try {
      const accessToken = marketplaceEncryptionService.decryptToken(account.encryptedAccessToken);
      await adapter.disconnect(accessToken);
    } catch (error) {
      appLogger.warn('marketplace.account.disconnect_provider_failed', {
        userId,
        accountId,
        provider: account.provider,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await marketplaceAccountRepository.updateTokens(
        accountId,
        {
          encryptedAccessToken: account.encryptedAccessToken,
          encryptedRefreshToken: null,
          tokenExpiresAt: account.tokenExpiresAt,
          status: 'DISCONNECTED',
          metadata: toAccountMetadataJson(
            mergeAccountMetadata(account.metadata, {
              disconnectedAt: new Date().toISOString(),
            }),
          ),
        },
        tx,
      );

      await tx.auditLog.create({
        data: {
          userId,
          action: 'marketplace.account.disconnected',
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

    appLogger.info('marketplace.account.disconnected', {
      userId,
      accountId,
      provider: updated.provider,
      externalStoreId: updated.externalStoreId,
    });

    return toMarketplaceAccountDetailDto(updated);
  }

  /**
   * Server-only accessor for future sync jobs and token refresh workers.
   * Never expose decrypted tokens through API responses.
   */
  async getDecryptedTokens(userId: string, accountId: string) {
    const account = await this.getOwnedAccount(accountId, userId);
    const health = reconcileAccountStatus(account.status, account.tokenExpiresAt);

    if (health === 'DISCONNECTED') {
      throw MarketplaceError.validation('Marketplace account is disconnected.');
    }

    if (health === 'EXPIRED' || health === 'RECONNECT_REQUIRED') {
      throw MarketplaceError.tokenExpired();
    }

    return {
      provider: account.provider,
      externalStoreId: account.externalStoreId,
      accessToken: marketplaceEncryptionService.decryptToken(account.encryptedAccessToken),
      refreshToken: marketplaceEncryptionService.safeDecryptToken(account.encryptedRefreshToken),
      tokenExpiresAt: account.tokenExpiresAt,
    };
  }

  private async getOwnedAccount(accountId: string, userId: string) {
    const account = await marketplaceAccountRepository.findByIdForUser(userId, accountId);

    if (!account) {
      throw MarketplaceError.notFound();
    }

    return account;
  }
}

export const marketplaceAccountService = new MarketplaceAccountService();
