import 'server-only';

import type { MarketplaceProduct, MarketplaceProvider, Prisma } from '@prisma/client';
import { notDeleted, prisma, type TransactionClient } from '@olshop/db';

export type UpsertMarketplaceProductData = {
  marketplaceAccountId: string;
  provider: MarketplaceProvider;
  externalProductId: string;
  externalVariantId: string;
  externalSku?: string | null;
  externalProductName: string;
  externalVariantName?: string | null;
  stock: number;
  status: string;
  rawPayload?: Record<string, unknown>;
};

export class MarketplaceProductRepository {
  async findManyByAccount(
    marketplaceAccountId: string,
    options?: { search?: string; unmappedOnly?: boolean; limit?: number; offset?: number },
  ): Promise<MarketplaceProduct[]> {
    const where: Prisma.MarketplaceProductWhereInput = {
      marketplaceAccountId,
      ...notDeleted,
    };

    if (options?.search?.trim()) {
      const term = options.search.trim();
      where.OR = [
        { externalSku: { contains: term, mode: 'insensitive' } },
        { externalProductName: { contains: term, mode: 'insensitive' } },
        { externalVariantName: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (options?.unmappedOnly) {
      where.mappings = { none: { ...notDeleted } };
    }

    return prisma.marketplaceProduct.findMany({
      where,
      orderBy: { lastImportedAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
      include: {
        mappings: {
          where: notDeleted,
          include: {
            productVariant: { select: { id: true, sku: true, name: true, barcode: true } },
          },
        },
      },
    });
  }

  async countByAccount(
    marketplaceAccountId: string,
    options?: { unmappedOnly?: boolean },
  ): Promise<number> {
    return prisma.marketplaceProduct.count({
      where: {
        marketplaceAccountId,
        ...notDeleted,
        ...(options?.unmappedOnly ? { mappings: { none: { ...notDeleted } } } : {}),
      },
    });
  }

  async findByIdForAccount(
    marketplaceAccountId: string,
    productId: string,
  ): Promise<MarketplaceProduct | null> {
    return prisma.marketplaceProduct.findFirst({
      where: { id: productId, marketplaceAccountId, ...notDeleted },
      include: {
        marketplaceAccount: { select: { id: true, storeName: true, provider: true } },
        mappings: {
          where: notDeleted,
          include: {
            productVariant: {
              select: { id: true, sku: true, name: true, barcode: true, isActive: true },
            },
          },
        },
      },
    });
  }

  async upsertByExternalVariant(
    data: UpsertMarketplaceProductData,
    tx?: TransactionClient,
  ): Promise<MarketplaceProduct> {
    const client = tx ?? prisma;

    return client.marketplaceProduct.upsert({
      where: {
        marketplaceAccountId_externalVariantId: {
          marketplaceAccountId: data.marketplaceAccountId,
          externalVariantId: data.externalVariantId,
        },
      },
      create: {
        marketplaceAccountId: data.marketplaceAccountId,
        provider: data.provider,
        externalProductId: data.externalProductId,
        externalVariantId: data.externalVariantId,
        externalSku: data.externalSku ?? null,
        externalProductName: data.externalProductName,
        externalVariantName: data.externalVariantName ?? null,
        stock: data.stock,
        status: data.status,
        rawPayload: data.rawPayload as Prisma.InputJsonValue,
        lastImportedAt: new Date(),
      },
      update: {
        externalProductId: data.externalProductId,
        externalSku: data.externalSku ?? null,
        externalProductName: data.externalProductName,
        externalVariantName: data.externalVariantName ?? null,
        stock: data.stock,
        status: data.status,
        rawPayload: data.rawPayload as Prisma.InputJsonValue,
        lastImportedAt: new Date(),
      },
    });
  }
}

export const marketplaceProductRepository = new MarketplaceProductRepository();
