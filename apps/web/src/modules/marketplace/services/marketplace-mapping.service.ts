import 'server-only';

import { prisma } from '@olshop/db';
import { buildManualRetryEventId, enqueuePropagateInventoryStock } from '@olshop/queue';
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
          lastSyncStatus: row.mapping.lastSyncStatus,
          lastSyncedAt: row.mapping.lastSyncedAt?.toISOString() ?? null,
          lastSyncError: row.mapping.lastSyncError,
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

  async setSyncEnabled(
    userId: string,
    connectionId: string,
    marketplaceProductId: string,
    enabled: boolean,
  ): Promise<MarketplaceListingItem> {
    await this.assertConnectionOwned(userId, connectionId);

    const updated = await prisma.marketplaceProductMapping.updateMany({
      where: { marketplaceProductId, userId },
      data: { syncEnabled: enabled },
    });
    if (updated.count === 0) throw MarketplaceError.notFound('Listing is not mapped.');

    appLogger.info('marketplace.listing.sync_toggled', {
      userId,
      connectionId,
      marketplaceProductId,
      enabled,
    });

    return this.getListing(userId, connectionId, marketplaceProductId);
  }

  async syncNow(
    userId: string,
    connectionId: string,
    marketplaceProductId: string,
  ): Promise<MarketplaceListingItem> {
    await this.assertConnectionOwned(userId, connectionId);

    const mapping = await prisma.marketplaceProductMapping.findFirst({
      where: { marketplaceProductId, userId },
      select: {
        id: true,
        syncEnabled: true,
        productVariantId: true,
        productVariant: { select: { inventory: { select: { availableStock: true } } } },
      },
    });
    if (!mapping) throw MarketplaceError.notFound('Listing is not mapped.');
    if (!mapping.syncEnabled) {
      throw MarketplaceError.validation('Enable sync for this listing first.');
    }

    const availableStock = mapping.productVariant.inventory?.availableStock ?? 0;
    const eventId = buildManualRetryEventId(mapping.id, Date.now());

    try {
      await enqueuePropagateInventoryStock({
        userId,
        variantId: mapping.productVariantId,
        availableStock,
        eventId,
      });
    } catch {
      throw MarketplaceError.validation(
        'Could not queue the sync — is the worker (Redis) running?',
      );
    }

    appLogger.info('marketplace.listing.sync_now', { userId, connectionId, marketplaceProductId });

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
