import { getServerEnv } from '@olshop/config/env.server';
import type { MarketplaceProvider } from '@prisma/client';
import { logger } from '@olshop/utils/logger';

import { safeDecryptMarketplaceToken } from './encryption.js';
import { getProviderRateLimiter } from './rate-limit.js';
import { getMarketplaceStockProvider } from './stock-provider.registry.js';
import { normalizeStockUpdateRequest, normalizeStockUpdateResponse } from './stock-normalizer.js';
import { MarketplaceSyncError } from './sync-errors.js';
import {
  loadSyncJobContext,
  markSyncJobDisabled,
  markSyncJobFailed,
  markSyncJobProcessing,
  markSyncJobSuccess,
  recordProviderHealthFailure,
  recordProviderHealthSuccess,
  updateMarketplaceProductStock,
  writeSyncLog,
} from './sync-repository.js';

export type ExecuteStockSyncInput = {
  syncJobId: string;
  availableStock: number;
  attemptNumber: number;
  maxAttempts: number;
};

export type ExecuteStockSyncResult = {
  success: boolean;
  skipped?: boolean;
  errorCode?: string;
  retryable?: boolean;
};

export async function executeStockSync(
  input: ExecuteStockSyncInput,
): Promise<ExecuteStockSyncResult> {
  const startedAt = Date.now();
  const context = await loadSyncJobContext(input.syncJobId);

  if (!context) {
    throw MarketplaceSyncError.mappingInvalid('Sync job not found.');
  }

  if (context.syncStatus === 'SUCCESS') {
    logger.info('marketplace.sync.idempotent_skip', { syncJobId: input.syncJobId });
    return { success: true, skipped: true };
  }

  if (context.syncStatus === 'DISABLED') {
    return { success: false, skipped: true, errorCode: 'DISABLED' };
  }

  const mapping = context.mapping;
  const account = mapping.marketplaceAccount;
  const product = mapping.marketplaceProduct;
  const variant = mapping.productVariant;

  if (mapping.deletedAt || !mapping.syncEnabled || mapping.mappingStatus !== 'MAPPED') {
    await markSyncJobDisabled(input.syncJobId, 'Mapping is not sync-ready.');
    await writeSyncLog({
      mappingId: mapping.id,
      status: 'FAILED',
      direction: 'outbound',
      message: 'Mapping is not sync-ready.',
    });
    return { success: false, errorCode: 'MAPPING_INVALID', retryable: false };
  }

  if (product.deletedAt || variant.deletedAt || !variant.isActive) {
    await markSyncJobDisabled(input.syncJobId, 'Linked product or variant is unavailable.');
    return { success: false, errorCode: 'MAPPING_INVALID', retryable: false };
  }

  if (account.status !== 'CONNECTED') {
    await markSyncJobDisabled(input.syncJobId, `Account status is ${account.status}.`);
    return { success: false, errorCode: 'ACCOUNT_DISABLED', retryable: false };
  }

  if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() <= Date.now()) {
    await markSyncJobFailed(input.syncJobId, 'Access token expired.', false);
    await recordProviderHealthFailure(account.id, 'INVALID_TOKEN', false);
    await writeSyncLog({
      mappingId: mapping.id,
      status: 'FAILED',
      direction: 'outbound',
      message: 'Access token expired.',
    });
    return { success: false, errorCode: 'INVALID_TOKEN', retryable: false };
  }

  const secret = getServerEnv().MARKETPLACE_ENCRYPTION_SECRET;
  const accessToken = safeDecryptMarketplaceToken(account.encryptedAccessToken, secret);

  if (!accessToken) {
    await markSyncJobFailed(input.syncJobId, 'Failed to decrypt access token.', false);
    await recordProviderHealthFailure(account.id, 'INVALID_TOKEN', false);
    return { success: false, errorCode: 'INVALID_TOKEN', retryable: false };
  }

  await markSyncJobProcessing(input.syncJobId);

  const provider = mapping.provider as MarketplaceProvider;
  const stockAdapter = getMarketplaceStockProvider(provider);
  const rateLimiter = getProviderRateLimiter(provider);

  const stockRequest = normalizeStockUpdateRequest({
    externalProductId: product.externalProductId,
    externalVariantId: product.externalVariantId,
    externalSku: product.externalSku,
    availableStock: input.availableStock,
  });

  logger.info('marketplace.sync.started', {
    syncJobId: input.syncJobId,
    mappingId: mapping.id,
    provider,
    quantity: stockRequest.quantity,
    attempt: input.attemptNumber,
  });

  try {
    const validation = await stockAdapter.validateStockSync(accessToken);
    if (!validation.ready) {
      throw MarketplaceSyncError.providerUnavailable(validation.reason ?? 'Provider not ready.');
    }

    await rateLimiter.acquire();

    const rawResponse = await stockAdapter.updateStock({
      ...stockRequest,
      accessToken,
    });

    const response = normalizeStockUpdateResponse(rawResponse);
    const latencyMs = Date.now() - startedAt;

    if (!response.success) {
      throw MarketplaceSyncError.syncFailed('Provider rejected stock update.');
    }

    await updateMarketplaceProductStock(
      product.id,
      account.id,
      response.externalStock ?? stockRequest.quantity,
    );

    await markSyncJobSuccess(input.syncJobId, {
      externalStock: response.externalStock,
      raw: response.raw,
      latencyMs,
    });

    await recordProviderHealthSuccess(account.id, latencyMs);

    await writeSyncLog({
      mappingId: mapping.id,
      status: 'SYNCED',
      direction: 'outbound',
      message: `Stock synced to ${stockRequest.quantity}.`,
      metadata: {
        syncJobId: input.syncJobId,
        quantity: stockRequest.quantity,
        latencyMs,
        provider,
      },
    });

    logger.info('marketplace.sync.completed', {
      syncJobId: input.syncJobId,
      mappingId: mapping.id,
      provider,
      quantity: stockRequest.quantity,
      latencyMs,
    });

    return { success: true };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const syncError =
      error instanceof MarketplaceSyncError
        ? error
        : MarketplaceSyncError.syncFailed(
            error instanceof Error ? error.message : 'Unknown sync error',
          );

    const retrying = syncError.retryable && input.attemptNumber < input.maxAttempts;

    await markSyncJobFailed(input.syncJobId, syncError.message, retrying);
    await recordProviderHealthFailure(
      account.id,
      syncError.code,
      syncError.code !== 'INVALID_TOKEN',
    );

    await writeSyncLog({
      mappingId: mapping.id,
      status: 'FAILED',
      direction: 'outbound',
      message: syncError.operatorMessage,
      metadata: {
        syncJobId: input.syncJobId,
        errorCode: syncError.code,
        retrying,
        latencyMs,
      },
    });

    logger.error('marketplace.sync.failed', {
      syncJobId: input.syncJobId,
      mappingId: mapping.id,
      provider,
      errorCode: syncError.code,
      retrying,
      latencyMs,
      message: syncError.message,
    });

    if (retrying) {
      throw syncError;
    }

    return {
      success: false,
      errorCode: syncError.code,
      retryable: syncError.retryable,
    };
  }
}
