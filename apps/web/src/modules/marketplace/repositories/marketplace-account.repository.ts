import 'server-only';

import type {
  MarketplaceAccount,
  MarketplaceAccountStatus,
  MarketplaceProvider,
  Prisma,
} from '@prisma/client';
import { notDeleted, prisma, type TransactionClient } from '@olshop/db';

export type CreateMarketplaceAccountData = {
  userId: string;
  provider: MarketplaceProvider;
  storeName: string;
  externalStoreId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  status?: MarketplaceAccountStatus;
  lastConnectedAt?: Date | null;
  metadata?: Record<string, unknown>;
};

export type UpdateMarketplaceAccountTokensData = {
  storeName?: string;
  encryptedAccessToken: string;
  encryptedRefreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  status?: MarketplaceAccountStatus;
  lastConnectedAt?: Date;
  metadata?: Record<string, unknown>;
};

export class MarketplaceAccountRepository {
  async findById(accountId: string): Promise<MarketplaceAccount | null> {
    return prisma.marketplaceAccount.findFirst({
      where: { id: accountId, ...notDeleted },
    });
  }

  async findManyByUser(userId: string): Promise<MarketplaceAccount[]> {
    return prisma.marketplaceAccount.findMany({
      where: { userId, ...notDeleted },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findByIdForUser(userId: string, accountId: string): Promise<MarketplaceAccount | null> {
    return prisma.marketplaceAccount.findFirst({
      where: { id: accountId, userId, ...notDeleted },
    });
  }

  async findByProviderStore(
    userId: string,
    provider: MarketplaceProvider,
    externalStoreId: string,
  ): Promise<MarketplaceAccount | null> {
    return prisma.marketplaceAccount.findFirst({
      where: { userId, provider, externalStoreId, ...notDeleted },
    });
  }

  async create(
    data: CreateMarketplaceAccountData,
    tx?: TransactionClient,
  ): Promise<MarketplaceAccount> {
    const client = tx ?? prisma;
    return client.marketplaceAccount.create({
      data: {
        userId: data.userId,
        provider: data.provider,
        storeName: data.storeName,
        externalStoreId: data.externalStoreId,
        encryptedAccessToken: data.encryptedAccessToken,
        encryptedRefreshToken: data.encryptedRefreshToken ?? null,
        tokenExpiresAt: data.tokenExpiresAt ?? null,
        status: data.status ?? 'CONNECTED',
        lastConnectedAt: data.lastConnectedAt ?? new Date(),
        metadata: data.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async updateTokens(
    accountId: string,
    data: UpdateMarketplaceAccountTokensData,
    tx?: TransactionClient,
  ): Promise<MarketplaceAccount> {
    const client = tx ?? prisma;
    return client.marketplaceAccount.update({
      where: { id: accountId },
      data: {
        ...(data.storeName ? { storeName: data.storeName } : {}),
        encryptedAccessToken: data.encryptedAccessToken,
        encryptedRefreshToken: data.encryptedRefreshToken ?? null,
        tokenExpiresAt: data.tokenExpiresAt ?? null,
        ...(data.status ? { status: data.status } : {}),
        ...(data.lastConnectedAt ? { lastConnectedAt: data.lastConnectedAt } : {}),
        ...(data.metadata !== undefined
          ? { metadata: data.metadata as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async updateStatus(
    accountId: string,
    status: MarketplaceAccountStatus,
    tx?: TransactionClient,
  ): Promise<MarketplaceAccount> {
    const client = tx ?? prisma;
    return client.marketplaceAccount.update({
      where: { id: accountId },
      data: { status },
    });
  }

  async updateMetadata(
    accountId: string,
    metadata: Record<string, unknown>,
    tx?: TransactionClient,
  ): Promise<MarketplaceAccount> {
    const client = tx ?? prisma;
    return client.marketplaceAccount.update({
      where: { id: accountId },
      data: { metadata: metadata as Prisma.InputJsonValue },
    });
  }

  async findExpiringBefore(before: Date, limit = 25): Promise<MarketplaceAccount[]> {
    return prisma.marketplaceAccount.findMany({
      where: {
        ...notDeleted,
        status: { in: ['CONNECTED', 'EXPIRED'] },
        tokenExpiresAt: { lte: before },
        encryptedRefreshToken: { not: null },
      },
      orderBy: { tokenExpiresAt: 'asc' },
      take: limit,
    });
  }

  async touchLastSync(accountId: string, syncedAt = new Date()): Promise<MarketplaceAccount> {
    return prisma.marketplaceAccount.update({
      where: { id: accountId },
      data: { lastSyncAt: syncedAt },
    });
  }
}

export const marketplaceAccountRepository = new MarketplaceAccountRepository();
