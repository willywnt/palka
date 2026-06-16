import 'server-only';

import { prisma } from '@falka/db';
import type { MarketplaceProvider, Prisma } from '@prisma/client';

import { appLogger } from '@/lib/logger';

import { getMarketplaceImportAdapter } from '../adapters/import-adapter';
import { MarketplaceError } from '../errors/marketplace-errors';
import { marketplaceEncryptionService } from './encryption.service';
import type { ImportListingsResult } from '../types';
import { buildVariantSkuIndex, matchSku } from '../utils/sku-match';

/**
 * Pulls external listings from a connection's provider (a stub adapter for now)
 * and stores them as MarketplaceProduct snapshots, then auto-maps any whose SKU
 * exactly matches an internal variant. Read-only: never writes to the marketplace.
 */
export class MarketplaceImportService {
  async importListings(
    organizationId: string,
    actorUserId: string,
    connectionId: string,
  ): Promise<ImportListingsResult> {
    const connection = await prisma.marketplaceConnection.findFirst({
      where: { id: connectionId, organizationId, deletedAt: null },
    });

    if (!connection) throw MarketplaceError.notFound();
    if (!connection.isActive) {
      throw MarketplaceError.validation('Marketplace connection is not active.');
    }

    const adapter = getMarketplaceImportAdapter(connection.provider);
    const listings = await adapter.fetchListings({
      shopId: connection.shopId,
      // Stub adapters ignore the token; seeded/stub connections store a non-cipher
      // placeholder, so decrypt leniently and let a real adapter fail its own auth.
      accessToken:
        marketplaceEncryptionService.safeDecryptToken(connection.encryptedAccessToken) ?? '',
    });

    const now = new Date();
    let skipped = 0;
    // Distinct warehouseCodes seen across the shop's listings — populates the sync-warehouse
    // picker (no per-SKU storage needed; the connection owns one warehouse).
    const warehouseCodes = new Set<string>();

    for (const listing of listings) {
      for (const warehouse of listing.warehouses ?? []) warehouseCodes.add(warehouse.code);
      const rawPayload = listing.raw as Prisma.InputJsonValue;

      try {
        await prisma.marketplaceProduct.upsert({
          where: {
            marketplaceConnectionId_externalProductId_externalVariantId: {
              marketplaceConnectionId: connection.id,
              externalProductId: listing.externalProductId,
              externalVariantId: listing.externalVariantId,
            },
          },
          create: {
            userId: actorUserId,
            organizationId,
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
      } catch (error) {
        // One malformed listing (e.g. a value the column can't hold) must not sink the
        // whole import — skip it and keep going. The rest still import + auto-map.
        skipped += 1;
        appLogger.warn('marketplace.import.listing_skipped', {
          organizationId,
          connectionId: connection.id,
          externalProductId: listing.externalProductId,
          externalVariantId: listing.externalVariantId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const imported = listings.length - skipped;

    const autoMapped = await this.autoMapBySku(
      organizationId,
      actorUserId,
      connection.id,
      connection.provider,
    );

    await prisma.marketplaceConnection.update({
      where: { id: connection.id },
      data: {
        lastImportedAt: now,
        // Don't clobber a previously-captured set when this import surfaced no warehouse data.
        ...(warehouseCodes.size > 0 ? { knownWarehouseCodes: [...warehouseCodes].sort() } : {}),
      },
    });

    appLogger.info('marketplace.listings.imported', {
      organizationId,
      connectionId: connection.id,
      imported,
      skipped,
      autoMapped,
    });

    return { imported, autoMapped };
  }

  /** Re-runs SKU auto-map over already-imported, still-unmapped listings (no provider fetch). */
  async rerunAutoMap(
    organizationId: string,
    actorUserId: string,
    connectionId: string,
  ): Promise<{ autoMapped: number }> {
    const connection = await prisma.marketplaceConnection.findFirst({
      where: { id: connectionId, organizationId, deletedAt: null },
      select: { id: true, provider: true },
    });
    if (!connection) throw MarketplaceError.notFound();

    const autoMapped = await this.autoMapBySku(
      organizationId,
      actorUserId,
      connection.id,
      connection.provider,
    );
    appLogger.info('marketplace.automap.rerun', { organizationId, connectionId, autoMapped });
    return { autoMapped };
  }

  /**
   * Auto-maps unmapped listings to internal variants by *normalized* SKU. An
   * exact SKU is mapped (confidence 1); a normalized-only match is mapped as
   * NEEDS_REVIEW (confidence 0.9) and stays sync-disabled until confirmed.
   */
  private async autoMapBySku(
    organizationId: string,
    actorUserId: string,
    connectionId: string,
    provider: MarketplaceProvider,
  ): Promise<number> {
    const unmapped = await prisma.marketplaceProduct.findMany({
      where: {
        marketplaceConnectionId: connectionId,
        organizationId,
        deletedAt: null,
        mapping: { is: null },
        externalSku: { not: null },
      },
      select: { id: true, externalSku: true },
    });

    if (unmapped.length === 0) return 0;

    const variants = await prisma.productVariant.findMany({
      where: { organizationId, deletedAt: null },
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
          userId: actorUserId,
          organizationId,
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
