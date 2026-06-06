import 'server-only';

import { prisma } from '@olshop/db';
import { buildManualRetryEventId, enqueuePropagateInventoryStock } from '@olshop/queue';
import type { MarketplaceProvider, Prisma } from '@prisma/client';

import { appLogger } from '@/lib/logger';

import { MarketplaceError } from '../errors/marketplace-errors';
import type { MarketplaceListingItem, MarketplaceSuggestedVariant } from '../types';
import { buildVariantSkuIndex, matchSku, type VariantSkuIndex } from '../utils/sku-match';

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

type SuggestionContext = {
  index: VariantSkuIndex;
  detailsById: Map<string, { id: string; sku: string; name: string; productName: string }>;
};

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

    const context = await this.buildSuggestionContext(userId, rows);
    return rows.map((row) => toListingItem(row, this.suggestionFor(row, context)));
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

  /**
   * Map a listing identified by its external reference (creating the listing
   * snapshot if it was never imported), then link it to a variant. Used when
   * resolving an unmapped order item so the mapping persists for future pulls.
   */
  async mapByExternalRef(
    userId: string,
    connectionId: string,
    ref: {
      externalProductId: string;
      externalVariantId: string;
      externalSku: string | null;
      externalName: string;
      provider: MarketplaceProvider;
    },
    variantId: string,
  ): Promise<void> {
    await this.assertConnectionOwned(userId, connectionId);

    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!variant) throw MarketplaceError.validation('Product variant not found.');

    const listing = await prisma.marketplaceProduct.upsert({
      where: {
        marketplaceConnectionId_externalProductId_externalVariantId: {
          marketplaceConnectionId: connectionId,
          externalProductId: ref.externalProductId,
          externalVariantId: ref.externalVariantId,
        },
      },
      create: {
        userId,
        marketplaceConnectionId: connectionId,
        provider: ref.provider,
        externalProductId: ref.externalProductId,
        externalVariantId: ref.externalVariantId,
        externalSku: ref.externalSku,
        externalProductName: ref.externalName,
        externalVariantName: null,
        stock: 0,
        status: 'ACTIVE',
        lastImportedAt: new Date(),
      },
      update: {},
      select: { id: true, provider: true },
    });

    await prisma.marketplaceProductMapping.upsert({
      where: { marketplaceProductId: listing.id },
      create: {
        userId,
        marketplaceConnectionId: connectionId,
        marketplaceProductId: listing.id,
        productVariantId: variantId,
        provider: listing.provider,
        mappingStatus: 'MAPPED',
        autoMapped: false,
      },
      update: { productVariantId: variantId, mappingStatus: 'MAPPED', autoMapped: false },
    });

    appLogger.info('marketplace.listing.mapped_by_ref', { userId, connectionId, variantId });
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

  /** Variant ids (from the given set) that have at least one marketplace mapping. */
  async getMappedVariantIds(userId: string, variantIds: string[]): Promise<Set<string>> {
    if (variantIds.length === 0) return new Set();
    const rows = await prisma.marketplaceProductMapping.findMany({
      where: { userId, productVariantId: { in: variantIds } },
      select: { productVariantId: true },
    });
    return new Set(rows.map((row) => row.productVariantId));
  }

  /**
   * Marketplace mappings per variant (a variant may map to several listings/shops).
   * Keyed by variant id; each entry links back to its connection for unmapping.
   */
  async getVariantMappings(
    userId: string,
    variantIds: string[],
  ): Promise<Map<string, { connectionId: string; provider: string; shopName: string }[]>> {
    const byVariant = new Map<
      string,
      { connectionId: string; provider: string; shopName: string }[]
    >();
    if (variantIds.length === 0) return byVariant;

    const rows = await prisma.marketplaceProductMapping.findMany({
      where: { userId, productVariantId: { in: variantIds } },
      select: {
        productVariantId: true,
        connection: { select: { id: true, provider: true, shopName: true } },
      },
    });

    for (const row of rows) {
      const list = byVariant.get(row.productVariantId) ?? [];
      list.push({
        connectionId: row.connection.id,
        provider: row.connection.provider,
        shopName: row.connection.shopName ?? row.connection.provider,
      });
      byVariant.set(row.productVariantId, list);
    }
    return byVariant;
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

    const context = await this.buildSuggestionContext(userId, [row]);
    return toListingItem(row, this.suggestionFor(row, context));
  }

  private async buildSuggestionContext(
    userId: string,
    rows: ListingRow[],
  ): Promise<SuggestionContext | null> {
    const hasUnmapped = rows.some((row) => !row.mapping && row.externalSku);
    if (!hasUnmapped) return null;

    const variants = await prisma.productVariant.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, sku: true, name: true, product: { select: { name: true } } },
    });

    return {
      index: buildVariantSkuIndex(variants),
      detailsById: new Map(
        variants.map((variant) => [
          variant.id,
          {
            id: variant.id,
            sku: variant.sku,
            name: variant.name,
            productName: variant.product.name,
          },
        ]),
      ),
    };
  }

  private suggestionFor(
    row: ListingRow,
    context: SuggestionContext | null,
  ): MarketplaceSuggestedVariant | null {
    if (!context || row.mapping || !row.externalSku) return null;

    const match = matchSku(row.externalSku, context.index);
    if (!match) return null;

    const details = context.detailsById.get(match.variantId);
    return details ? { ...details, quality: match.quality } : null;
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
