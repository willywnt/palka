import 'server-only';

import type { ImportProductsResult } from './marketplace-product-import.service';
import { appLogger } from '@/lib/logger';

/** BullMQ-ready import enqueue — worker registration deferred. */
export function enqueueMarketplaceProductImport(payload: {
  userId: string;
  marketplaceAccountId: string;
  dryRun?: boolean;
}): ImportProductsResult | null {
  appLogger.info('marketplace.import.enqueue_prepared', {
    userId: payload.userId,
    accountId: payload.marketplaceAccountId,
    dryRun: payload.dryRun ?? false,
    queue: 'marketplace-product-import',
    job: 'import-marketplace-products',
  });

  return null;
}
