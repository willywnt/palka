import 'server-only';

import { prisma } from '@falka/db';
import { computeStockDrift, findDriftMappedListings } from '@falka/queue';
import type { DriftExternalInput } from '@falka/queue';
import type { MarketplaceProvider } from '@prisma/client';

import { appLogger } from '@/lib/logger';

import { getMarketplaceImportAdapter } from '../adapters/import-adapter';
import { MarketplaceError } from '../errors/marketplace-errors';
import type { MarketplaceDriftReport } from '../types';
import { marketplaceEncryptionService } from './encryption.service';

/**
 * On-demand drift reconciliation: pulls a connection's CURRENT external stock
 * (read-only, no snapshot write) and compares each mapped variant's provider stock
 * against internal available. Surfaces over/under/missing drift so staff can re-sync;
 * never writes back to the marketplace and never overwrites internal stock. Pulls only
 * the MAPPED items when the adapter supports it (no full-catalog scan).
 */
export class MarketplaceReconciliationService {
  async checkDrift(organizationId: string, connectionId: string): Promise<MarketplaceDriftReport> {
    const connection = await prisma.marketplaceConnection.findFirst({
      where: { id: connectionId, organizationId, deletedAt: null },
    });
    if (!connection) throw MarketplaceError.notFound();
    if (!connection.isActive) {
      throw MarketplaceError.validation('Marketplace connection is not active.');
    }

    const [mapped, totalListings] = await Promise.all([
      findDriftMappedListings(organizationId, connectionId),
      prisma.marketplaceProduct.count({
        where: { marketplaceConnectionId: connectionId, organizationId, deletedAt: null },
      }),
    ]);

    // Nothing mapped → nothing to reconcile; skip the provider call entirely.
    const base =
      mapped.length === 0
        ? computeStockDrift({ mapped: [], external: [] })
        : computeStockDrift({
            mapped,
            external: await this.fetchExternalStock(connection, mapped),
          });

    // Per-item drift pulls ONLY the mapped items, so the computed unmappedExternal is
    // meaningless — report the real "listings not yet mapped" count from the DB instead.
    const summary = { ...base, unmappedExternal: Math.max(0, totalListings - mapped.length) };

    appLogger.info('marketplace.drift.checked', {
      organizationId,
      connectionId,
      provider: connection.provider,
      drifted: summary.drifted,
      missingExternal: summary.missingExternal,
      unmappedExternal: summary.unmappedExternal,
    });

    return {
      connectionId,
      provider: connection.provider,
      shopName: connection.shopName,
      checkedAt: new Date().toISOString(),
      summary,
    };
  }

  /**
   * Current external stock for the mapped items — only those items (one provider call
   * each when the adapter supports it), not the whole catalog. Falls back to a full
   * listings pull for adapters without per-item fetch (the tiny stub).
   */
  private async fetchExternalStock(
    connection: { provider: MarketplaceProvider; shopId: string; encryptedAccessToken: string },
    mapped: { externalProductId: string }[],
  ): Promise<DriftExternalInput[]> {
    const adapter = getMarketplaceImportAdapter(connection.provider);
    // Stub adapters ignore the token; seeded connections store a non-cipher placeholder,
    // so decrypt leniently and let a real adapter fail its own auth.
    const accessToken =
      marketplaceEncryptionService.safeDecryptToken(connection.encryptedAccessToken) ?? '';
    const externalProductIds = [...new Set(mapped.map((item) => item.externalProductId))];

    const listings =
      adapter.fetchListingsForItems && externalProductIds.length > 0
        ? await adapter.fetchListingsForItems({ accessToken, externalProductIds })
        : await adapter.fetchListings({ shopId: connection.shopId, accessToken });

    return listings.map((listing) => ({
      externalProductId: listing.externalProductId,
      externalVariantId: listing.externalVariantId,
      stock: listing.stock,
    }));
  }
}

export const marketplaceReconciliationService = new MarketplaceReconciliationService();
