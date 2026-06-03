import 'server-only';

import { prisma } from '@olshop/db';
import type { MarketplaceProvider, Prisma } from '@prisma/client';

import { appLogger } from '@/lib/logger';

import { getMarketplaceImportAdapter } from '../adapters/import-adapter';
import { MarketplaceError } from '../errors/marketplace-errors';
import type { ImportListingsResult } from '../types';

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

  /** Links still-unmapped listings to internal variants with an identical SKU. */
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

    const skus = [
      ...new Set(
        unmapped.map((product) => product.externalSku).filter((sku): sku is string => sku !== null),
      ),
    ];

    const variants = await prisma.productVariant.findMany({
      where: { userId, sku: { in: skus }, deletedAt: null },
      select: { id: true, sku: true },
    });
    const variantIdBySku = new Map(variants.map((variant) => [variant.sku, variant.id]));

    let mapped = 0;
    for (const product of unmapped) {
      const variantId = product.externalSku ? variantIdBySku.get(product.externalSku) : undefined;
      if (!variantId) continue;

      await prisma.marketplaceProductMapping.create({
        data: {
          userId,
          marketplaceConnectionId: connectionId,
          marketplaceProductId: product.id,
          productVariantId: variantId,
          provider,
          mappingStatus: 'MAPPED',
          autoMapped: true,
          mappingConfidence: 1,
        },
      });
      mapped += 1;
    }

    return mapped;
  }
}

export const marketplaceImportService = new MarketplaceImportService();
