import 'server-only';

import { prisma } from '@falka/db';
import type { MarketplaceProvider, MarketplaceConnection } from '@prisma/client';

import { MarketplaceError } from '../errors/marketplace-errors';
import type {
  MarketplaceConnectionDetail,
  MarketplaceConnectionListItem,
  MarketplaceConnectionStatus,
} from '../types';
import type { CreateMarketplaceConnectionInput } from '../validators/create-connection';
import { getTokenStatus } from '../utils/token-lifecycle';
import { isSupportedMarketplaceProvider } from './provider.registry';
import { marketplaceEncryptionService } from './encryption.service';
import { appLogger } from '@/lib/logger';
import { auditService } from '@/modules/audit/services/audit.service';

function resolveConnectionStatus(
  isActive: boolean,
  tokenExpiresAt: Date | null,
): MarketplaceConnectionStatus {
  if (!isActive) return 'disconnected';
  if (getTokenStatus(tokenExpiresAt) === 'expired') return 'expired';
  return 'connected';
}

function mapConnection(connection: MarketplaceConnection): MarketplaceConnectionListItem {
  const tokenStatus = getTokenStatus(connection.tokenExpiresAt);

  return {
    id: connection.id,
    provider: connection.provider,
    shopId: connection.shopId,
    shopName: connection.shopName,
    isActive: connection.isActive,
    tokenExpiresAt: connection.tokenExpiresAt?.toISOString() ?? null,
    tokenStatus,
    connectionStatus: resolveConnectionStatus(connection.isActive, connection.tokenExpiresAt),
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
    lastImportedAt: connection.lastImportedAt?.toISOString() ?? null,
    lastOrdersPulledAt: connection.lastOrdersPulledAt?.toISOString() ?? null,
    syncWarehouseCode: connection.syncWarehouseCode,
    knownWarehouseCodes: connection.knownWarehouseCodes,
  };
}

export class MarketplaceServerService {
  async listConnections(organizationId: string): Promise<MarketplaceConnectionListItem[]> {
    // Sync-health rollup per store: listings awaiting review + failed pushes,
    // so the connections list can flag trouble without opening each detail.
    const [connections, reviewCounts, failedCounts] = await Promise.all([
      prisma.marketplaceConnection.findMany({
        where: {
          organizationId,
          deletedAt: null,
        },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.marketplaceProductMapping.groupBy({
        by: ['marketplaceConnectionId'],
        where: { organizationId, mappingStatus: 'NEEDS_REVIEW' },
        _count: { _all: true },
      }),
      prisma.marketplaceProductMapping.groupBy({
        by: ['marketplaceConnectionId'],
        where: { organizationId, lastSyncStatus: 'FAILED' },
        _count: { _all: true },
      }),
    ]);

    const reviewByConnection = new Map(
      reviewCounts.map((row) => [row.marketplaceConnectionId, row._count._all]),
    );
    const failedByConnection = new Map(
      failedCounts.map((row) => [row.marketplaceConnectionId, row._count._all]),
    );

    return connections.map((connection) => ({
      ...mapConnection(connection),
      needsReviewCount: reviewByConnection.get(connection.id) ?? 0,
      failedSyncCount: failedByConnection.get(connection.id) ?? 0,
    }));
  }

  async getConnectionById(
    organizationId: string,
    connectionId: string,
  ): Promise<MarketplaceConnectionDetail> {
    const connection = await this.getOwnedConnection(connectionId, organizationId);
    return mapConnection(connection);
  }

  async createConnection(
    organizationId: string,
    actorUserId: string,
    input: CreateMarketplaceConnectionInput,
  ): Promise<MarketplaceConnectionDetail> {
    if (!isSupportedMarketplaceProvider(input.provider)) {
      throw MarketplaceError.invalidProvider();
    }

    const encryptedAccessToken = marketplaceEncryptionService.encryptToken(input.accessToken);
    const encryptedRefreshToken = input.refreshToken
      ? marketplaceEncryptionService.encryptToken(input.refreshToken)
      : null;

    const existing = await prisma.marketplaceConnection.findFirst({
      where: {
        organizationId,
        provider: input.provider,
        shopId: input.shopId,
        deletedAt: null,
      },
    });

    if (existing?.isActive) {
      throw MarketplaceError.duplicateConnection();
    }

    const connection = await prisma.$transaction(async (tx) => {
      if (existing) {
        return tx.marketplaceConnection.update({
          where: { id: existing.id },
          data: {
            shopName: input.shopName,
            encryptedAccessToken,
            encryptedRefreshToken,
            tokenExpiresAt: input.expiresAt,
            isActive: true,
          },
        });
      }

      return tx.marketplaceConnection.create({
        data: {
          userId: actorUserId,
          organizationId,
          provider: input.provider as MarketplaceProvider,
          shopId: input.shopId,
          shopName: input.shopName,
          encryptedAccessToken,
          encryptedRefreshToken,
          tokenExpiresAt: input.expiresAt,
          isActive: true,
        },
      });
    });

    appLogger.info('marketplace.connected', {
      organizationId,
      connectionId: connection.id,
      provider: connection.provider,
      shopId: connection.shopId,
    });
    void auditService.log({
      organizationId,
      actorUserId,
      action: 'marketplace.connected',
      resource: 'marketplace_connection',
      metadata: {
        connectionId: connection.id,
        provider: connection.provider,
        shopId: connection.shopId,
        shopName: connection.shopName,
      },
    });

    return mapConnection(connection);
  }

  /**
   * Create-or-update a connection from an OAuth grant. Unlike createConnection, re-authorizing
   * an already-active shop UPDATES its tokens (a fresh consent = a fresh token) instead of
   * throwing — re-auth is a legitimate recovery when the refresh token has lapsed.
   */
  async upsertOAuthConnection(
    organizationId: string,
    actorUserId: string,
    input: CreateMarketplaceConnectionInput & { shopCipher?: string | null },
  ): Promise<MarketplaceConnectionDetail> {
    if (!isSupportedMarketplaceProvider(input.provider)) {
      throw MarketplaceError.invalidProvider();
    }

    const encryptedAccessToken = marketplaceEncryptionService.encryptToken(input.accessToken);
    const encryptedRefreshToken = input.refreshToken
      ? marketplaceEncryptionService.encryptToken(input.refreshToken)
      : null;

    const existing = await prisma.marketplaceConnection.findFirst({
      where: { organizationId, provider: input.provider, shopId: input.shopId, deletedAt: null },
    });

    const connection = existing
      ? await prisma.marketplaceConnection.update({
          where: { id: existing.id },
          data: {
            shopName: input.shopName,
            encryptedAccessToken,
            encryptedRefreshToken,
            tokenExpiresAt: input.expiresAt,
            isActive: true,
            // Only overwrite the cipher when this grant carried one (TikTok re-resolves it);
            // a Lazada/Shopee re-auth omits it and must not clobber the stored value.
            ...(input.shopCipher !== undefined ? { externalShopCipher: input.shopCipher } : {}),
          },
        })
      : await prisma.marketplaceConnection.create({
          data: {
            userId: actorUserId,
            organizationId,
            provider: input.provider as MarketplaceProvider,
            shopId: input.shopId,
            shopName: input.shopName,
            externalShopCipher: input.shopCipher ?? null,
            encryptedAccessToken,
            encryptedRefreshToken,
            tokenExpiresAt: input.expiresAt,
            isActive: true,
          },
        });

    appLogger.info('marketplace.connected', {
      organizationId,
      connectionId: connection.id,
      provider: connection.provider,
      shopId: connection.shopId,
      reconnected: Boolean(existing),
    });
    void auditService.log({
      organizationId,
      actorUserId,
      action: 'marketplace.connected',
      resource: 'marketplace_connection',
      metadata: {
        connectionId: connection.id,
        provider: connection.provider,
        shopId: connection.shopId,
        shopName: connection.shopName,
        reconnected: Boolean(existing),
        via: 'oauth',
      },
    });

    return mapConnection(connection);
  }

  async disconnectConnection(
    organizationId: string,
    actorUserId: string,
    connectionId: string,
  ): Promise<MarketplaceConnectionDetail> {
    const connection = await this.getOwnedConnection(connectionId, organizationId);

    if (!connection.isActive) {
      return mapConnection(connection);
    }

    const updated = await prisma.marketplaceConnection.update({
      where: { id: connectionId },
      data: { isActive: false },
    });

    appLogger.info('marketplace.disconnected', {
      organizationId,
      connectionId,
      provider: updated.provider,
      shopId: updated.shopId,
    });
    void auditService.log({
      organizationId,
      actorUserId,
      action: 'marketplace.disconnected',
      resource: 'marketplace_connection',
      metadata: {
        connectionId: updated.id,
        provider: updated.provider,
        shopId: updated.shopId,
        shopName: updated.shopName,
      },
    });

    return mapConnection(updated);
  }

  /**
   * Server-only accessor for future sync jobs and token refresh workers.
   * Never expose decrypted tokens through API responses.
   */
  async getDecryptedTokens(organizationId: string, connectionId: string) {
    const connection = await this.getOwnedConnection(connectionId, organizationId);

    if (!connection.isActive) {
      throw MarketplaceError.validation('Marketplace connection is not active.');
    }

    return {
      provider: connection.provider,
      shopId: connection.shopId,
      accessToken: marketplaceEncryptionService.decryptToken(connection.encryptedAccessToken),
      refreshToken: marketplaceEncryptionService.safeDecryptToken(connection.encryptedRefreshToken),
      tokenExpiresAt: connection.tokenExpiresAt,
    };
  }

  /**
   * Re-seal a connection's tokens after an OAuth refresh (new access token, possibly a
   * rotated refresh token + a new expiry). Keeps the old refresh token if the provider
   * didn't return a new one. Server-only — decrypted tokens never leave the server.
   */
  async applyRefreshedTokens(
    organizationId: string,
    actorUserId: string,
    connectionId: string,
    input: { accessToken: string; refreshToken: string | null; expiresAt: Date | null },
  ): Promise<MarketplaceConnectionDetail> {
    const connection = await this.getOwnedConnection(connectionId, organizationId);

    const encryptedAccessToken = marketplaceEncryptionService.encryptToken(input.accessToken);
    const encryptedRefreshToken = input.refreshToken
      ? marketplaceEncryptionService.encryptToken(input.refreshToken)
      : connection.encryptedRefreshToken;

    const updated = await prisma.marketplaceConnection.update({
      where: { id: connectionId },
      data: {
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt: input.expiresAt,
        isActive: true,
      },
    });

    appLogger.info('marketplace.token_refreshed', {
      organizationId,
      connectionId,
      provider: updated.provider,
    });
    void auditService.log({
      organizationId,
      actorUserId,
      action: 'marketplace.token_refreshed',
      resource: 'marketplace_connection',
      metadata: { connectionId, provider: updated.provider, shopId: updated.shopId },
    });

    return mapConnection(updated);
  }

  /**
   * Set (or clear) the connection's Lazada sync warehouse — the ONE warehouse Falka owns. Stock
   * push then targets only this warehouseCode and leaves the others untouched (non-destructive);
   * null reverts to the single-warehouse bare path. Owner-facing config, not a token/secret.
   */
  async updateSyncWarehouse(
    organizationId: string,
    actorUserId: string,
    connectionId: string,
    syncWarehouseCode: string | null,
  ): Promise<MarketplaceConnectionDetail> {
    const connection = await this.getOwnedConnection(connectionId, organizationId);

    // Only allow a warehouseCode the shop actually exposes (seen at import) — or the currently
    // saved one (so a re-save survives an import that surfaced fewer codes). A bogus/typo'd code
    // would be silently ignored by Lazada (code:0) yet make stock sync a no-op and drift read 0
    // as false "under". null clears it back to the single-warehouse path.
    if (
      syncWarehouseCode !== null &&
      !connection.knownWarehouseCodes.includes(syncWarehouseCode) &&
      syncWarehouseCode !== connection.syncWarehouseCode
    ) {
      throw MarketplaceError.validation(
        'Kode gudang tidak dikenali untuk channel ini. Impor listing dulu agar gudangnya terdeteksi.',
      );
    }

    const updated = await prisma.marketplaceConnection.update({
      where: { id: connectionId },
      data: { syncWarehouseCode },
    });

    appLogger.info('marketplace.sync_warehouse_updated', {
      organizationId,
      connectionId,
      provider: updated.provider,
      syncWarehouseCode,
    });
    void auditService.log({
      organizationId,
      actorUserId,
      action: 'marketplace.sync_warehouse_updated',
      resource: 'marketplace_connection',
      metadata: { connectionId, provider: updated.provider, syncWarehouseCode },
    });

    return mapConnection(updated);
  }

  private async getOwnedConnection(connectionId: string, organizationId: string) {
    const connection = await prisma.marketplaceConnection.findFirst({
      where: {
        id: connectionId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!connection) {
      throw MarketplaceError.notFound();
    }

    return connection;
  }
}

export const marketplaceServerService = new MarketplaceServerService();
