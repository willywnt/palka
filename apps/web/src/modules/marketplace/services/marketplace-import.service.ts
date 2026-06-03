import 'server-only';

import { prisma } from '@olshop/db';
import type { MarketplaceProvider, Prisma } from '@prisma/client';

import { appLogger } from '@/lib/logger';

import { getMarketplaceImportAdapter } from '../adapters/import-adapter';
import { MarketplaceError } from '../errors/marketplace-errors';
import type { ImportListingsResult } from '../types';
import { buildVariantSkuIndex, matchSku } from '../utils/sku-match';

/**
 * Pulls external listings from a connection's provider (a stub adapter for now)
 * and stores them as MarketplaceProduct snapshots, then auto-maps any whose SKU
 * exactly matches an internal variant. Read-only: never writes to the marketplace.
 */
export class MarketplaceImportService {
  async importListings(userId: string, connectionId: string): Promise<ImportListingsResult> {
    const connection = await prisma.marketplaceConnection.findFirst({
      where: { id: connectionId, userId, deletedAt: null },
    });

    if (!connection) throw MarketplaceError.notFound();
    if (!connection.isActive) {
      throw MarketplaceError.validation('Marketplace connection is not active.');
    }

    const adapter = getMarketplaceImportAdapter(connection.provider);
    const listings = await adapter.fetchListings({
      shopId: connection.shopId,
      accessToken: '',
    });

    const now = new Date();

    for (const listing of listings) {
      const rawPayload = listing.raw as Prisma.InputJsonValue;

      await prisma.marketplaceProduct.upsert({
        where: {
          marketplaceConnectionId_externalProductId_externalVariantId: {
            marketplaceConnectionId: connection.id,
            externalProductId: listing.externalProductId,
            externalVariantId: listing.externalVariantId,
          },
        },
        create: {
          userId,
          marketplaceConnectionId: connection.id,
          provider: connection.provider,
          externalProductId: listing.externalProductId,
          externalVariantId: listing.externalVariantId,
          externalSku: listing.externalSku,
          externalProductName: listing.externalProductName,
          externalVariantName: listing.externalVariantName,
          stock: listing.stock,
          status: listing.status,
          rawPayload,
          lastImportedAt: now,
        },
        update: {
          externalSku: listing.externalSku,
          externalProductName: listing.externalProductName,
          externalVariantName: listing.externalVariantName,
          stock: listing.stock,
          status: listing.status,
          rawPayload,
          lastImportedAt: now,
          deletedAt: null,
        },
      });
    }

    const autoMapped = await this.autoMapBySku(userId, connection.id, connection.provider);

    await prisma.marketplaceConnection.update({
      where: { id: connection.id },
      data: { lastImportedAt: now },
    });

    appLogger.info('marketplace.listings.imported', {
      userId,
      connectionId: connection.id,
      imported: listings.length,
      autoMapped,
    });

    return { imported: listings.length, autoMapped };
  }

  /** Re-runs SKU auto-map over already-imported, still-unmapped listings (no provider fetch). */
  async rerunAutoMap(userId: string, connectionId: string): Promise<{ autoMapped: number }> {
    const connection = await prisma.marketplaceConnection.findFirst({
      where: { id: connectionId, userId, deletedAt: null },
      select: { id: true, provider: true },
    });
    if (!connection) throw MarketplaceError.notFound();

    const autoMapped = await this.autoMapBySku(userId, connection.id, connection.provider);
    appLogger.info('marketplace.automap.rerun', { userId, connectionId, autoMapped });
    return { autoMapped };
  }

  /**
   * Auto-maps unmapped listings to internal variants by *normalized* SKU. An
   * exact SKU is mapped (confidence 1); a normalized-only match is mapped as
   * NEEDS_REVIEW (confidence 0.9) and stays sync-disabled until confirmed.
   */
  private async autoMapBySku(
    userId: string,
    connectionId: string,
    provider: MarketplaceProvider,
  ): Promise<number> {
    const unmapped = await prisma.marketplaceProduct.findMany({
      where: {
        marketplaceConnectionId: connectionId,
        userId,
        deletedAt: null,
        mapping: { is: null },
        externalSku: { not: null },
      },
      select: { id: true, externalSku: true },
    });

    if (unmapped.length === 0) return 0;

    const variants = await prisma.productVariant.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, sku: true },
    });
    const index = buildVariantSkuIndex(variants);

    let mapped = 0;
    for (const product of unmapped) {
      if (!product.externalSku) continue;
      const match = matchSku(product.externalSku, index);
      if (!match) continue;

      const exact = match.quality === 'EXACT';
      await prisma.marketplaceProductMapping.create({
        data: {
          userId,
          marketplaceConnectionId: connectionId,
          marketplaceProductId: product.id,
          productVariantId: match.variantId,
          provider,
          mappingStatus: exact ? 'MAPPED' : 'NEEDS_REVIEW',
          autoMapped: true,
          mappingConfidence: exact ? 1 : 0.9,
        },
      });
      mapped += 1;
    }

    return mapped;
  }
}

export const marketplaceImportService = new MarketplaceImportService();
