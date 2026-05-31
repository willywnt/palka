import 'server-only';

import type { MarketplaceSyncJobStatus, Prisma } from '@prisma/client';
import { notDeleted, prisma } from '@olshop/db';

export class MarketplaceSyncJobRepository {
  async findManyByUser(
    userId: string,
    options?: {
      marketplaceAccountId?: string;
      syncStatus?: MarketplaceSyncJobStatus | MarketplaceSyncJobStatus[];
      limit?: number;
      offset?: number;
    },
  ) {
    const where: Prisma.MarketplaceSyncJobWhereInput = {
      marketplaceAccount: { userId, ...notDeleted },
      ...(options?.marketplaceAccountId
        ? { marketplaceAccountId: options.marketplaceAccountId }
        : {}),
      ...(options?.syncStatus
        ? {
            syncStatus: Array.isArray(options.syncStatus)
              ? { in: options.syncStatus }
              : options.syncStatus,
          }
        : {}),
    };

    return prisma.marketplaceSyncJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
      include: {
        mapping: {
          include: {
            productVariant: { select: { sku: true, name: true } },
            marketplaceProduct: {
              select: { externalSku: true, externalProductName: true },
            },
          },
        },
        marketplaceAccount: {
          select: {
            id: true,
            storeName: true,
            provider: true,
            status: true,
            tokenExpiresAt: true,
            providerHealth: {
              select: { consecutiveFailures: true, lastSuccessAt: true },
            },
          },
        },
      },
    });
  }

  async countByUser(
    userId: string,
    options?: { syncStatus?: MarketplaceSyncJobStatus | MarketplaceSyncJobStatus[] },
  ) {
    return prisma.marketplaceSyncJob.count({
      where: {
        marketplaceAccount: { userId, ...notDeleted },
        ...(options?.syncStatus
          ? {
              syncStatus: Array.isArray(options.syncStatus)
                ? { in: options.syncStatus }
                : options.syncStatus,
            }
          : {}),
      },
    });
  }

  async findByIdForUser(userId: string, syncJobId: string) {
    return prisma.marketplaceSyncJob.findFirst({
      where: {
        id: syncJobId,
        marketplaceAccount: { userId, ...notDeleted },
      },
      include: {
        mapping: {
          include: {
            productVariant: {
              include: { inventory: { select: { availableStock: true } } },
            },
            marketplaceProduct: true,
          },
        },
        marketplaceAccount: {
          include: { providerHealth: true },
        },
      },
    });
  }

  async findProviderHealthByUser(userId: string) {
    return prisma.marketplaceProviderHealth.findMany({
      where: { marketplaceAccount: { userId, ...notDeleted } },
      include: {
        marketplaceAccount: { select: { id: true, storeName: true, provider: true, status: true } },
      },
    });
  }
}

export const marketplaceSyncJobRepository = new MarketplaceSyncJobRepository();
