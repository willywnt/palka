import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MarketplaceProvider } from '@prisma/client';

import type { SyncJobContext } from '../../src/marketplace-sync/sync-repository.js';

/**
 * executeStockSync is the live stock-write path to Lazada/Shopee/Tokopedia. These
 * tests lock its load-bearing contract — the skip/disable gate, the token-expired
 * FAIL-not-disable gate, the success path, the retryable-vs-final-failure decision
 * (which governs whether a failed marketplace push is retried or permanently
 * dropped), and the lazy refresh-and-persist — with every Prisma/provider/token
 * collaborator mocked.
 */

const { repo, providerMock, tokenRefreshMock, tokenRepoMock, cryptoMock } = vi.hoisted(() => ({
  repo: {
    loadSyncJobContext: vi.fn(),
    disableSyncJob: vi.fn(),
    failSyncJob: vi.fn(),
    markSyncJobProcessing: vi.fn(),
    completeSyncJobSuccess: vi.fn(),
  },
  providerMock: { updateStock: vi.fn() },
  tokenRefreshMock: { canRefreshProvider: vi.fn(() => false), refreshProviderToken: vi.fn() },
  tokenRepoMock: { applyRefreshedConnectionTokens: vi.fn() },
  cryptoMock: { decrypt: vi.fn(() => 'access-token'), encrypt: vi.fn(() => 'cipher') },
}));

vi.mock('../../src/marketplace-sync/sync-repository.js', () => repo);
vi.mock('../../src/marketplace-sync/stock-provider.registry.js', () => ({
  getMarketplaceStockProvider: () => providerMock,
}));
vi.mock('../../src/marketplace-sync/token-refresh.js', () => tokenRefreshMock);
vi.mock('../../src/marketplace-sync/token-repository.js', () => tokenRepoMock);
vi.mock('../../src/marketplace-sync/provider-rate-limit-redis.js', () => ({
  acquireProviderToken: vi.fn(),
  penalizeProvider: vi.fn(),
}));
vi.mock('../../src/marketplace-sync/stock-normalizer.js', () => ({
  normalizeStockUpdateRequest: (input: {
    externalProductId: string;
    externalVariantId: string;
    externalSku: string | null;
    availableStock: number;
    syncWarehouseCode: string | null;
  }) => ({
    externalProductId: input.externalProductId,
    externalVariantId: input.externalVariantId,
    externalSku: input.externalSku,
    quantity: input.availableStock,
    syncWarehouseCode: input.syncWarehouseCode,
  }),
}));
vi.mock('@palka/config/env.server', () => ({
  getServerEnv: () => ({ MARKETPLACE_ENCRYPTION_SECRET: 'secret' }),
}));
vi.mock('@palka/utils/crypto', () => cryptoMock);
vi.mock('@palka/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { executeStockSync } = await import('../../src/marketplace-sync/sync-engine.js');

function makeContext(overrides: Partial<SyncJobContext> = {}): SyncJobContext {
  return {
    jobId: 'job-1',
    attempts: 1,
    provider: 'LAZADA' as MarketplaceProvider,
    connectionId: 'conn-1',
    mappingId: 'map-1',
    marketplaceProductId: 'mp-1',
    syncEnabled: true,
    connectionActive: true,
    shopId: 'shop-1',
    shopCipher: null,
    encryptedAccessToken: 'enc-access',
    encryptedRefreshToken: null,
    tokenExpiresAt: null,
    syncWarehouseCode: null,
    externalProductId: 'p1',
    externalVariantId: 'v1',
    externalSku: 'SKU-1',
    availableStock: 7,
    variantDeleted: false,
    productDeleted: false,
    ...overrides,
  };
}

beforeEach(() => {
  tokenRefreshMock.canRefreshProvider.mockReturnValue(false);
  tokenRefreshMock.refreshProviderToken.mockReset();
  tokenRepoMock.applyRefreshedConnectionTokens.mockReset();
  cryptoMock.decrypt.mockReturnValue('access-token');
  cryptoMock.encrypt.mockReturnValue('cipher');
  providerMock.updateStock.mockReset();
  repo.loadSyncJobContext.mockReset();
});

describe('executeStockSync', () => {
  it('skips and disables a mapping that is no longer sync-eligible', async () => {
    repo.loadSyncJobContext.mockResolvedValue(makeContext({ syncEnabled: false }));

    const result = await executeStockSync('job-1', 1, 3);

    expect(result).toMatchObject({ success: false, skipped: true });
    expect(repo.disableSyncJob).toHaveBeenCalledTimes(1);
    expect(providerMock.updateStock).not.toHaveBeenCalled();
    expect(repo.failSyncJob).not.toHaveBeenCalled();
  });

  it('returns skipped when the job context is gone', async () => {
    repo.loadSyncJobContext.mockResolvedValue(null);

    const result = await executeStockSync('job-1', 1, 3);

    expect(result).toMatchObject({ success: false, skipped: true });
    expect(providerMock.updateStock).not.toHaveBeenCalled();
  });

  it('FAILS (not disables, not retryable) when the token is expired, before touching the provider', async () => {
    repo.loadSyncJobContext.mockResolvedValue(
      makeContext({ tokenExpiresAt: new Date(Date.now() - 1_000) }),
    );

    const result = await executeStockSync('job-1', 1, 3);

    expect(result).toMatchObject({ success: false, retryable: false });
    expect(repo.failSyncJob).toHaveBeenCalledWith(expect.objectContaining({ finalFailure: true }));
    expect(repo.disableSyncJob).not.toHaveBeenCalled();
    expect(providerMock.updateStock).not.toHaveBeenCalled();
  });

  it('completes successfully on a provider-accepted push', async () => {
    repo.loadSyncJobContext.mockResolvedValue(makeContext());
    providerMock.updateStock.mockResolvedValue({ success: true, externalStock: 7, raw: { ok: 1 } });

    const result = await executeStockSync('job-1', 1, 3);

    expect(result).toEqual({ success: true });
    expect(repo.markSyncJobProcessing).toHaveBeenCalledWith('job-1');
    expect(repo.completeSyncJobSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ syncJobId: 'job-1', mappingId: 'map-1', externalStock: 7 }),
    );
    expect(repo.failSyncJob).not.toHaveBeenCalled();
  });

  it('marks a provider rejection retryable but NOT final on a non-final attempt', async () => {
    repo.loadSyncJobContext.mockResolvedValue(makeContext());
    providerMock.updateStock.mockResolvedValue({ success: false });

    const result = await executeStockSync('job-1', 1, 3);

    expect(result).toMatchObject({ success: false, retryable: true });
    expect(repo.failSyncJob).toHaveBeenCalledWith(expect.objectContaining({ finalFailure: false }));
    expect(repo.completeSyncJobSuccess).not.toHaveBeenCalled();
  });

  it('marks the SAME rejection final once attempts are exhausted', async () => {
    repo.loadSyncJobContext.mockResolvedValue(makeContext());
    providerMock.updateStock.mockResolvedValue({ success: false });

    const result = await executeStockSync('job-1', 3, 3);

    expect(result).toMatchObject({ success: false, retryable: true });
    expect(repo.failSyncJob).toHaveBeenCalledWith(expect.objectContaining({ finalFailure: true }));
  });

  it('lazily refreshes + persists an expiring token, then pushes with the fresh one', async () => {
    repo.loadSyncJobContext.mockResolvedValue(
      makeContext({
        tokenExpiresAt: new Date(Date.now() + 60_000), // within the 10-min refresh window
        encryptedRefreshToken: 'enc-refresh',
      }),
    );
    tokenRefreshMock.canRefreshProvider.mockReturnValue(true);
    tokenRefreshMock.refreshProviderToken.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresInSeconds: 3_600,
    });
    providerMock.updateStock.mockResolvedValue({ success: true, externalStock: 7, raw: {} });

    const result = await executeStockSync('job-1', 1, 3);

    expect(tokenRefreshMock.refreshProviderToken).toHaveBeenCalledTimes(1);
    expect(tokenRepoMock.applyRefreshedConnectionTokens).toHaveBeenCalledWith(
      'conn-1',
      expect.objectContaining({ tokenExpiresAt: expect.any(Date) }),
    );
    expect(providerMock.updateStock).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'new-access' }),
    );
    expect(result).toEqual({ success: true });
  });
});
