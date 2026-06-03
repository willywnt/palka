import 'server-only';

import { prisma } from '@olshop/db';
import type { Prisma } from '@prisma/client';

import { appLogger } from '@/lib/logger';

import { MarketplaceError } from '../errors/marketplace-errors';
import type { MarketplaceListingItem, MarketplaceSuggestedVariant } from '../types';

const LISTING_INCLUDE = {
  mapping: {
    include: {
      productVariant: {
        select: { id: true, sku: true, name: true, product: { select: { name: true } } },
      },
    },
  },
} satisfies Prisma.MarketplaceProductInclude;

type ListingRow = Prisma.MarketplaceProductGetPayload<{ include: typeof LISTING_INCLUDE }>;

function toListingItem(
  row: ListingRow,
  suggestion: MarketplaceSuggestedVariant | null,
): MarketplaceListingItem {
  return {
    marketplaceProductId: row.id,
    externalProductId: row.externalProductId,
    externalVariantId: row.externalVariantId,
    externalSku: row.externalSku,
    externalProductName: row.externalProductName,
    externalVariantName: row.externalVariantName,
    stock: row.stock,
    status: row.status,
    lastImportedAt: row.lastImportedAt.toISOString(),
    mapping: row.mapping
      ? {
          variantId: row.mapping.productVariantId,
          variantSku: row.mapping.productVariant.sku,
          variantName: row.mapping.productVariant.name,
          productName: row.mapping.productVariant.product.name,
          syncEnabled: row.mapping.syncEnabled,
          autoMapped: row.mapping.autoMapped,
          mappingStatus: row.mapping.mappingStatus,
        }
      : null,
    suggestedVariant: row.mapping ? null : suggestion,
  };
}

/** Manages the link between imported listings and internal variants. */
export class MarketplaceMappingService {
  async listListings(userId: string, connectionId: string): Promise<MarketplaceListingItem[]> {
    await this.assertConnectionOwned(userId, connectionId);

    const rows = await prisma.marketplaceProduct.findMany({
      where: { marketplaceConnectionId: connectionId, userId, deletedAt: null },
      include: LISTING_INCLUDE,
      orderBy: [{ externalProductName: 'asc' }, { externalVariantName: 'asc' }],
    });

    const suggestions = await this.buildSuggestions(userId, rows);
    return rows.map((row) => toListingItem(row, this.suggestionFor(row, suggestions)));
  }

  async mapListing(
    userId: string,
    connectionId: string,
    marketplaceProductId: string,
    variantId: string,
  ): Promise<MarketplaceListingItem> {
    await this.assertConnectionOwned(userId, connectionId);

    const product = await prisma.marketplaceProduct.findFirst({
      where: {
        id: marketplaceProductId,
        marketplaceConnectionId: connectionId,
        userId,
        deletedAt: null,
      },
      select: { id: true, provider: true },
    });
    if (!product) throw MarketplaceError.notFound('Listing not found.');

    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!variant) throw MarketplaceError.validation('Product variant not found.');

    await prisma.marketplaceProductMapping.upsert({
      where: { marketplaceProductId },
      create: {
        userId,
        marketplaceConnectionId: connectionId,
        marketplaceProductId,
        productVariantId: variantId,
        provider: product.provider,
        mappingStatus: 'MAPPED',
        autoMapped: false,
      },
      update: { productVariantId: variantId, mappingStatus: 'MAPPED', autoMapped: false },
    });

    appLogger.info('marketplace.listing.mapped', {
      userId,
      connectionId,
      marketplaceProductId,
      variantId,
    });

    return this.getListing(userId, connectionId, marketplaceProductId);
  }

  async unmapListing(
    userId: string,
    connectionId: string,
    marketplaceProductId: string,
  ): Promise<MarketplaceListingItem> {
    await this.assertConnectionOwned(userId, connectionId);

    await prisma.marketplaceProductMapping.deleteMany({ where: { marketplaceProductId, userId } });

    appLogger.info('marketplace.listing.unmapped', { userId, connectionId, marketplaceProductId });

    return this.getListing(userId, connectionId, marketplaceProductId);
  }

  private async getListing(
    userId: string,
    connectionId: string,
    marketplaceProductId: string,
  ): Promise<MarketplaceListingItem> {
    const row = await prisma.marketplaceProduct.findFirst({
      where: {
        id: marketplaceProductId,
        marketplaceConnectionId: connectionId,
        userId,
        deletedAt: null,
      },
      include: LISTING_INCLUDE,
    });
    if (!row) throw MarketplaceError.notFound('Listing not found.');

    const suggestions = await this.buildSuggestions(userId, [row]);
    return toListingItem(row, this.suggestionFor(row, suggestions));
  }

  private async buildSuggestions(
    userId: string,
    rows: ListingRow[],
  ): Promise<Map<string, MarketplaceSuggestedVariant>> {
    const skus = [
      ...new Set(
        rows
          .filter((row) => !row.mapping && row.externalSku)
          .map((row) => row.externalSku as string),
      ),
    ];
    if (skus.length === 0) return new Map();

    const variants = await prisma.productVariant.findMany({
      where: { userId, sku: { in: skus }, deletedAt: null },
      select: { id: true, sku: true, name: true, product: { select: { name: true } } },
    });

    return new Map(
      variants.map((variant) => [
        variant.sku,
        { id: variant.id, sku: variant.sku, name: variant.name, productName: variant.product.name },
      ]),
    );
  }

  private suggestionFor(
    row: ListingRow,
    suggestions: Map<string, MarketplaceSuggestedVariant>,
  ): MarketplaceSuggestedVariant | null {
    if (row.mapping || !row.externalSku) return null;
    return suggestions.get(row.externalSku) ?? null;
  }

  private async assertConnectionOwned(userId: string, connectionId: string): Promise<void> {
    const connection = await prisma.marketplaceConnection.findFirst({
      where: { id: connectionId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!connection) throw MarketplaceError.notFound();
  }
}

export const marketplaceMappingService = new MarketplaceMappingService();
