import { describe, expect, it, vi } from 'vitest';

import type { MarketplaceProvider } from '@prisma/client';

/**
 * The Dev simulator must never stand in for a real connection in production:
 * getMarketplaceStockProvider falls back to the Unwired adapter (which rejects)
 * when NODE_ENV is production, so a worker missing a provider's creds fails loudly
 * instead of marking pushes SYNCED while the marketplace is never updated.
 */

const { getServerEnvMock } = vi.hoisted(() => ({ getServerEnvMock: vi.fn() }));
vi.mock('@falka/config/env.server', () => ({ getServerEnv: getServerEnvMock }));

const { getMarketplaceStockProvider } =
  await import('../../src/marketplace-sync/stock-provider.registry.js');

const params = {
  externalProductId: 'p1',
  externalVariantId: 'v1',
  externalSku: 'SKU-1',
  quantity: 5,
  syncWarehouseCode: null,
  accessToken: 'tok',
  shopId: 'shop-1',
  shopCipher: null,
};

describe('getMarketplaceStockProvider production fallback', () => {
  it('falls back to the rejecting Unwired adapter for an unwired provider in production', async () => {
    getServerEnvMock.mockReturnValue({ NODE_ENV: 'production' });

    // SHOPEE is not registered in this test → fallback path.
    const adapter = getMarketplaceStockProvider('SHOPEE' as MarketplaceProvider);

    await expect(adapter.updateStock(params)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      retryable: true,
    });
  });

  it('falls back to the Dev simulator (fakes success) outside production', async () => {
    getServerEnvMock.mockReturnValue({ NODE_ENV: 'development' });

    // TOKOPEDIA — a different provider so the per-provider registry cache from the
    // production test above does not bleed into this one.
    const adapter = getMarketplaceStockProvider('TOKOPEDIA' as MarketplaceProvider);

    await expect(adapter.updateStock(params)).resolves.toMatchObject({
      success: true,
      externalStock: 5,
    });
  });
});
