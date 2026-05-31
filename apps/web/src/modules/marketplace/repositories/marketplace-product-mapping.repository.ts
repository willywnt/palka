import 'server-only';

import type {
  MarketplaceMappingStatus,
  MarketplaceProductMapping,
  MarketplaceProvider,
  Prisma,
} from '@prisma/client';
import { notDeleted, prisma, type TransactionClient } from '@olshop/db';

export type CreateMappingData = {
  productVariantId: string;
  marketplaceProductId: string;
  marketplaceAccountId: string;
  provider: MarketplaceProvider;
  mappingStatus?: MarketplaceMappingStatus;
  syncEnabled?: boolean;
  autoMapped?: boolean;
  mappingConfidence?: number | null;
};

export class MarketplaceProductMappingRepository {
  async findManyByUser(
    userId: string,
    options?: {
      marketplaceAccountId?: string;
      mappingStatus?: MarketplaceMappingStatus;
      search?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: Prisma.MarketplaceProductMappingWhereInput = {
      ...notDeleted,
      marketplaceAccount: { userId, ...notDeleted },
      ...(options?.marketplaceAccountId
        ? { marketplaceAccountId: options.marketplaceAccountId }
        : {}),
      ...(options?.mappingStatus ? { mappingStatus: options.mappingStatus } : {}),
    };

    if (options?.search?.trim()) {
      const term = options.search.trim();
      where.OR = [
        { productVariant: { sku: { contains: term, mode: 'insensitive' } } },
        { marketplaceProduct: { externalSku: { contains: term, mode: 'insensitive' } } },
        { marketplaceProduct: { externalProductName: { contains: term, mode: 'insensitive' } } },
      ];
    }

    return prisma.marketplaceProductMapping.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
      include: {
        productVariant: {
          select: { id: true, sku: true, name: true, barcode: true, isActive: true },
        },
        marketplaceProduct: {
          select: {
            id: true,
            externalSku: true,
            externalProductName: true,
            externalVariantName: true,
            stock: true,
            status: true,
            deletedAt: true,
          },
        },
        marketplaceAccount: { select: { id: true, storeName: true, provider: true } },
      },
    });
  }

  async findByIdForUser(userId: string, mappingId: string) {
    return prisma.marketplaceProductMapping.findFirst({
      where: {
        id: mappingId,
        ...notDeleted,
        marketplaceAccount: { userId, ...notDeleted },
      },
      include: {
        productVariant: true,
        marketplaceProduct: true,
        marketplaceAccount: true,
      },
    });
  }

  async findByVariantAndAccount(productVariantId: string, marketplaceAccountId: string) {
    return prisma.marketplaceProductMapping.findFirst({
      where: { productVariantId, marketplaceAccountId, ...notDeleted },
    });
  }

  async findByProductAndAccount(marketplaceProductId: string, marketplaceAccountId: string) {
    return prisma.marketplaceProductMapping.findFirst({
      where: { marketplaceProductId, marketplaceAccountId, ...notDeleted },
    });
  }

  async create(
    data: CreateMappingData,
    tx?: TransactionClient,
  ): Promise<MarketplaceProductMapping> {
    const client = tx ?? prisma;
    return client.marketplaceProductMapping.create({
      data: {
        productVariantId: data.productVariantId,
        marketplaceProductId: data.marketplaceProductId,
        marketplaceAccountId: data.marketplaceAccountId,
        provider: data.provider,
        mappingStatus: data.mappingStatus ?? 'MAPPED',
        syncEnabled: data.syncEnabled ?? true,
        autoMapped: data.autoMapped ?? false,
        mappingConfidence: data.mappingConfidence ?? null,
      },
    });
  }

  async softDelete(mappingId: string, tx?: TransactionClient): Promise<MarketplaceProductMapping> {
    const client = tx ?? prisma;
    return client.marketplaceProductMapping.update({
      where: { id: mappingId },
      data: { deletedAt: new Date(), mappingStatus: 'UNMAPPED', syncEnabled: false },
    });
  }

  async updateStatus(
    mappingId: string,
    mappingStatus: MarketplaceMappingStatus,
    tx?: TransactionClient,
  ) {
    const client = tx ?? prisma;
    return client.marketplaceProductMapping.update({
      where: { id: mappingId },
      data: { mappingStatus },
    });
  }
}

export const marketplaceProductMappingRepository = new MarketplaceProductMappingRepository();
