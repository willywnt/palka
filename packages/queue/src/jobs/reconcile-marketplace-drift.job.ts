import { getServerEnv } from '@falka/config/env.server';
import { decrypt } from '@falka/utils/crypto';
import { logger } from '@falka/utils/logger';

import {
  computeStockDrift,
  countConnectionListings,
  findActiveConnectionsForDrift,
  findDriftMappedListings,
  getMarketplaceStockProvider,
  getProviderRateLimiter,
  isAccessTokenExpired,
  resolveSyncWarehouseStock,
} from '../marketplace-sync/index.js';
import {
  reconcileMarketplaceDriftJobSchema,
  type JobResultMetadata,
  type ReconcileMarketplaceDriftJobPayload,
} from '../types/index.js';

export function getDefaultReconcileMarketplaceDriftPayload(): ReconcileMarketplaceDriftJobPayload {
  return reconcileMarketplaceDriftJobSchema.parse({});
}

/**
 * Scheduled drift reconciliation: for each active connection whose provider can
 * report listings, pull current external stock and compare it to internal
 * available, logging any over/under/missing drift. READ-ONLY — never writes back
 * to the marketplace and never corrects internal stock (staff re-sync from the UI).
 * Best-effort per connection: one failure (token, provider) doesn't stop the rest.
 */
export async function processReconcileMarketplaceDriftJob(
  rawPayload: ReconcileMarketplaceDriftJobPayload,
): Promise<JobResultMetadata> {
  const startedAt = Date.now();
  const payload = reconcileMarketplaceDriftJobSchema.parse(rawPayload);

  const stats: JobResultMetadata = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    durationMs: 0,
  };

  const connections = await findActiveConnectionsForDrift(payload.batchSize);
  let totalDrifted = 0;

  for (const connection of connections) {
    stats.processed += 1;

    if (isAccessTokenExpired(connection.tokenExpiresAt)) {
      stats.skipped += 1;
      logger.warn('marketplace.drift.skipped_token_expired', {
        connectionId: connection.id,
        provider: connection.provider,
      });
      continue;
    }

    let accessToken = '';
    try {
      accessToken = decrypt(
        connection.encryptedAccessToken,
        getServerEnv().MARKETPLACE_ENCRYPTION_SECRET,
      );
    } catch {
      // Stub/seed connections store a non-cipher placeholder; a real adapter will
      // surface its own auth error below rather than failing here.
    }

    try {
      const mapped = await findDriftMappedListings(connection.organizationId, connection.id);
      // Nothing mapped → nothing to reconcile; don't call the provider.
      if (mapped.length === 0) {
        stats.skipped += 1;
        continue;
      }

      await getProviderRateLimiter(connection.provider).acquire();
      const adapter = getMarketplaceStockProvider(connection.provider);
      const externalProductIds = [...new Set(mapped.map((item) => item.externalProductId))];
      // Pull ONLY the mapped items when the adapter supports it (no full-catalog scan).
      const external = adapter.fetchListingsForItems
        ? await adapter.fetchListingsForItems({
            accessToken,
            shopId: connection.shopId,
            shopCipher: connection.externalShopCipher,
            externalProductIds,
          })
        : await adapter.fetchListings({
            accessToken,
            shopId: connection.shopId,
            shopCipher: connection.externalShopCipher,
          });

      // Provider can't enumerate listings (stub) — nothing to reconcile.
      if (external === null) {
        stats.skipped += 1;
        continue;
      }

      // Falka owns ONE warehouse: compare internal available against the sync warehouse's own
      // sellable (when configured), not the cross-warehouse sum.
      const resolvedExternal = external.map((listing) => ({
        externalProductId: listing.externalProductId,
        externalVariantId: listing.externalVariantId,
        stock: resolveSyncWarehouseStock(listing, connection.syncWarehouseCode),
      }));

      const summary = computeStockDrift({ mapped, external: resolvedExternal });
      // Per-item drift only pulls mapped items, so report the real "not yet mapped" from the DB.
      const total = await countConnectionListings(connection.organizationId, connection.id);
      const unmappedExternal = Math.max(0, total - mapped.length);
      const driftCount = summary.drifted + summary.missingExternal;
      totalDrifted += driftCount;
      stats.succeeded += 1;

      const logContext = {
        connectionId: connection.id,
        provider: connection.provider,
        organizationId: connection.organizationId,
        totalMapped: summary.totalMapped,
        inSync: summary.inSync,
        drifted: summary.drifted,
        missingExternal: summary.missingExternal,
        unmappedExternal,
      };
      if (driftCount > 0) {
        logger.warn('marketplace.drift.detected', logContext);
      } else {
        logger.info('marketplace.drift.reconciled', logContext);
      }
    } catch (error) {
      stats.failed += 1;
      logger.warn('marketplace.drift.failed', {
        connectionId: connection.id,
        provider: connection.provider,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  stats.durationMs = Date.now() - startedAt;
  stats.details = { connections: connections.length, totalDrifted };
  return stats;
}
