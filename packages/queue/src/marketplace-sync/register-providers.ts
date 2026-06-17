import { getServerEnv } from '@falka/config/env.server';
import { logger } from '@falka/utils/logger';

import { LazadaStockProvider } from './providers/lazada-stock-provider.js';
import { ShopeeStockProvider } from './providers/shopee-stock-provider.js';
import { TokopediaStockProvider } from './providers/tokopedia-stock-provider.js';
import { registerMarketplaceStockProvider } from './stock-provider.registry.js';

/**
 * Registers the real provider stock adapters that are configured via env. Any
 * provider left unregistered falls back to the Dev (simulated) adapter, so
 * unconfigured providers keep working end-to-end in dev. Call once at worker
 * startup, before the sync workers begin consuming jobs.
 */
export function registerConfiguredStockProviders(): void {
  const env = getServerEnv();

  if (env.LAZADA_APP_KEY && env.LAZADA_APP_SECRET) {
    registerMarketplaceStockProvider(new LazadaStockProvider());
    logger.info('marketplace.stock.provider_registered', { provider: 'LAZADA' });
  }

  if (env.SHOPEE_PARTNER_ID && env.SHOPEE_PARTNER_KEY) {
    registerMarketplaceStockProvider(new ShopeeStockProvider());
    logger.info('marketplace.stock.provider_registered', { provider: 'SHOPEE' });
  }

  if (env.TOKOPEDIA_APP_KEY && env.TOKOPEDIA_APP_SECRET) {
    registerMarketplaceStockProvider(new TokopediaStockProvider());
    logger.info('marketplace.stock.provider_registered', { provider: 'TOKOPEDIA' });
  }
}
