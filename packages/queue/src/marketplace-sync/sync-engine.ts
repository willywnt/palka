import { getServerEnv } from '@palka/config/env.server';
import { decrypt, encrypt } from '@palka/utils/crypto';
import { logger } from '@palka/utils/logger';

import { acquireProviderToken } from './provider-rate-limit-redis.js';
import { normalizeStockUpdateRequest } from './stock-normalizer.js';
import { getMarketplaceStockProvider } from './stock-provider.registry.js';
import {
  completeSyncJobSuccess,
  disableSyncJob,
  failSyncJob,
  loadSyncJobContext,
  markSyncJobProcessing,
  type SyncJobContext,
} from './sync-repository.js';
import { MarketplaceSyncError } from './sync-errors.js';
import { applyRefreshedConnectionTokens } from './token-repository.js';
import { canRefreshProvider, refreshProviderToken } from './token-refresh.js';

/**
 * Refresh the access token if it expires within this window. Short-TTL providers (Shopee
 * ~4h) would otherwise be expired most of the day, since the refresh cron runs only daily.
 */
const TOKEN_REFRESH_SAFETY_MS = 10 * 60 * 1000;

export type ExecuteStockSyncResult = {
  success: boolean;
  skipped?: boolean;
  errorCode?: string;
  retryable?: boolean;
};

/**
 * A connection's access token is expired when it carries an expiry that is at or
 * before `now`. A null expiry means "no expiry recorded" (stub/seed connections)
 * and is treated as not-expired so the existing flows are unaffected.
 */
export function isAccessTokenExpired(expiresAt: Date | null, now: Date = new Date()): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

function isTokenExpiringSoon(expiresAt: Date | null, now: Date = new Date()): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime() + TOKEN_REFRESH_SAFETY_MS;
}

/**
 * Returns a usable access token for the connection, refreshing it first when it's expired or
 * about to expire AND the provider can be refreshed. A successful refresh persists the new
 * tokens so the next job reuses them. Best-effort: if the refresh fails we return the existing
 * (decrypted) token and let the expiry gate in {@link executeStockSync} fail the job cleanly.
 * Lazada tokens last ~30 days, so this is a no-op for them on the hot path (the daily cron
 * handles those); it exists for short-TTL providers like Shopee (~4h).
 */
async function ensureFreshAccessToken(
  context: SyncJobContext,
): Promise<{ accessToken: string; tokenExpiresAt: Date | null }> {
  const secret = getServerEnv().MARKETPLACE_ENCRYPTION_SECRET;

  let accessToken = '';
  try {
    accessToken = decrypt(context.encryptedAccessToken, secret);
  } catch {
    // Seeded/stub connections store a non-cipher placeholder — the Dev stub ignores the token,
    // and a real adapter surfaces its own auth error rather than failing every job here.
    logger.warn('marketplace.stock.token_decrypt_failed', {
      connectionId: context.connectionId,
      provider: context.provider,
    });
  }

  if (
    !isTokenExpiringSoon(context.tokenExpiresAt) ||
    !context.encryptedRefreshToken ||
    !canRefreshProvider(context.provider)
  ) {
    return { accessToken, tokenExpiresAt: context.tokenExpiresAt };
  }

  let refreshToken = '';
  try {
    refreshToken = decrypt(context.encryptedRefreshToken, secret);
  } catch {
    return { accessToken, tokenExpiresAt: context.tokenExpiresAt };
  }
  if (!refreshToken) return { accessToken, tokenExpiresAt: context.tokenExpiresAt };

  try {
    const refreshed = await refreshProviderToken({
      provider: context.provider,
      refreshToken,
      shopId: context.shopId,
    });
    const tokenExpiresAt =
      refreshed.expiresInSeconds > 0
        ? new Date(Date.now() + refreshed.expiresInSeconds * 1000)
        : null;

    await applyRefreshedConnectionTokens(context.connectionId, {
      encryptedAccessToken: encrypt(refreshed.accessToken, secret),
      // Keep the existing refresh token when the provider doesn't rotate it.
      encryptedRefreshToken: refreshed.refreshToken
        ? encrypt(refreshed.refreshToken, secret)
        : context.encryptedRefreshToken,
      tokenExpiresAt,
    });

    logger.info('marketplace.stock.token_lazy_refreshed', {
      connectionId: context.connectionId,
      provider: context.provider,
    });

    return { accessToken: refreshed.accessToken, tokenExpiresAt };
  } catch (error) {
    logger.warn('marketplace.stock.token_lazy_refresh_failed', {
      connectionId: context.connectionId,
      provider: context.provider,
      error: error instanceof Error ? error.message : String(error),
    });
    return { accessToken, tokenExpiresAt: context.tokenExpiresAt };
  }
}

/**
 * Pushes a single mapping's current available stock to its marketplace listing.
 * Reads the LATEST available stock so repeated events converge to the truth.
 * Returns a result; the caller (job processor) decides whether to throw for a
 * BullMQ retry based on `retryable`.
 */
export async function executeStockSync(
  syncJobId: string,
  attemptNumber: number,
  maxAttempts: number,
): Promise<ExecuteStockSyncResult> {
  const context = await loadSyncJobContext(syncJobId);
  if (!context) return { success: false, skipped: true };

  if (
    !context.syncEnabled ||
    !context.connectionActive ||
    context.productDeleted ||
    context.variantDeleted
  ) {
    await disableSyncJob({ syncJobId, reason: 'Mapping is no longer sync-eligible.' });
    return { success: false, skipped: true };
  }

  // Refresh-before-use: short-TTL providers (Shopee ~4h) would otherwise be expired most of
  // the day since the cron runs daily. Best-effort — refreshes + persists when expiring soon,
  // else returns the current token. Lazada (~30d) is untouched on the hot path.
  const fresh = await ensureFreshAccessToken(context);

  // Reject an expired token BEFORE touching the provider: a real adapter would
  // otherwise burn a network call and a non-retryable failure on every mapping.
  // Unlike the eligibility gate above we FAIL (not DISABLE) the job — once the
  // token is refreshed the mapping is sync-eligible again and a fresh event syncs.
  if (isAccessTokenExpired(fresh.tokenExpiresAt)) {
    const error = MarketplaceSyncError.tokenExpired();
    await failSyncJob({
      syncJobId,
      mappingId: context.mappingId,
      errorMessage: error.message,
      finalFailure: true,
    });
    logger.warn('marketplace.stock.token_expired', {
      syncJobId,
      provider: context.provider,
    });
    return { success: false, errorCode: error.code, retryable: false };
  }

  await markSyncJobProcessing(syncJobId);

  try {
    await acquireProviderToken(context.provider, context.shopId);

    const adapter = getMarketplaceStockProvider(context.provider);
    const request = normalizeStockUpdateRequest({
      externalProductId: context.externalProductId,
      externalVariantId: context.externalVariantId,
      externalSku: context.externalSku,
      availableStock: context.availableStock,
      syncWarehouseCode: context.syncWarehouseCode,
    });

    // The (possibly just-refreshed) token comes from ensureFreshAccessToken above; stub
    // adapters ignore it. The shop id is required by shop-scoped providers (Shopee).
    const response = await adapter.updateStock({
      ...request,
      accessToken: fresh.accessToken,
      shopId: context.shopId,
      shopCipher: context.shopCipher,
    });

    if (!response.success) {
      throw MarketplaceSyncError.syncFailed('Provider rejected the stock update.');
    }

    await completeSyncJobSuccess({
      syncJobId,
      mappingId: context.mappingId,
      marketplaceProductId: context.marketplaceProductId,
      externalStock: response.externalStock,
      providerResponse: response.raw ?? {},
    });

    logger.info('marketplace.stock.synced', {
      syncJobId,
      provider: context.provider,
      quantity: request.quantity,
    });

    return { success: true };
  } catch (error) {
    const isSyncError = error instanceof MarketplaceSyncError;
    const retryable = isSyncError ? error.retryable : true;
    const errorCode = isSyncError ? error.code : 'SYNC_FAILED';
    const message = error instanceof Error ? error.message : String(error);
    const finalFailure = !retryable || attemptNumber >= maxAttempts;

    await failSyncJob({
      syncJobId,
      mappingId: context.mappingId,
      errorMessage: message,
      finalFailure,
    });

    logger.warn('marketplace.stock.sync_failed', {
      syncJobId,
      provider: context.provider,
      errorCode,
      retryable,
      finalFailure,
    });

    return { success: false, errorCode, retryable };
  }
}
