import { prisma } from '@falka/db';
import type { MarketplaceProvider } from '@prisma/client';

import type { DriftMappedInput } from './drift.js';

/** A connection the reconciliation job needs to pull + compare (active, not deleted). */
export type DriftConnection = {
  id: string;
  organizationId: string;
  provider: MarketplaceProvider;
  shopId: string;
  externalShopCipher: string | null;
  shopName: string;
  encryptedAccessToken: string;
  tokenExpiresAt: Date | null;
  syncWarehouseCode: string | null;
};

/** Total non-deleted imported listings for a connection (drives the real "unmapped" count). */
export async function countConnectionListings(
  organizationId: string,
  connectionId: string,
): Promise<number> {
  return prisma.marketplaceProduct.count({
    where: { marketplaceConnectionId: connectionId, organizationId, deletedAt: null },
  });
}

/** Active connections to reconcile, oldest-imported first, capped at `limit`. */
export async function findActiveConnectionsForDrift(limit: number): Promise<DriftConnection[]> {
  return prisma.marketplaceConnection.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: [{ lastImportedAt: 'asc' }, { createdAt: 'asc' }],
    take: limit,
    select: {
      id: true,
      organizationId: true,
      provider: true,
      shopId: true,
      externalShopCipher: true,
      shopName: true,
      encryptedAccessToken: true,
      tokenExpiresAt: true,
      syncWarehouseCode: true,
    },
  });
}

/**
 * A connection's mapped listings, shaped for {@link computeStockDrift} (the
 * internal side). Shared by the worker reconciliation job and the web on-demand
 * drift-check so both compare the same internal stock the same way.
 */
export async function findDriftMappedListings(
  organizationId: string,
  connectionId: string,
): Promise<DriftMappedInput[]> {
  const rows = await prisma.marketplaceProduct.findMany({
    where: {
      marketplaceConnectionId: connectionId,
      organizationId,
      deletedAt: null,
      mapping: { isNot: null },
    },
    select: {
      id: true,
      externalProductId: true,
      externalVariantId: true,
      externalSku: true,
      mapping: {
        select: {
          syncEnabled: true,
          productVariant: {
            select: {
              id: true,
              sku: true,
              name: true,
              product: { select: { name: true } },
              inventory: { select: { availableStock: true } },
            },
          },
        },
      },
    },
  });

  const mapped: DriftMappedInput[] = [];
  for (const row of rows) {
    if (!row.mapping) continue;
    const variant = row.mapping.productVariant;
    mapped.push({
      marketplaceProductId: row.id,
      externalProductId: row.externalProductId,
      externalVariantId: row.externalVariantId,
      externalSku: row.externalSku,
      variantId: variant.id,
      variantSku: variant.sku,
      variantName: variant.name,
      productName: variant.product.name,
      internalAvailable: variant.inventory?.availableStock ?? 0,
      syncEnabled: row.mapping.syncEnabled,
    });
  }

  return mapped;
}
