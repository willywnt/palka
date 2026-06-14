'use client';

import { REORDER_DEFAULTS } from '@/modules/inventory/config';
import { useReorderReportQuery } from '@/modules/inventory/hooks/use-inventory';
import { useMarketplaceHealthQuery } from '@/modules/marketplace/hooks/use-marketplace-health';
import { useOrdersQuery } from '@/modules/orders/hooks/use-orders';
import { useReturnsQuery } from '@/modules/returns/hooks/use-returns';
import { useHasPermission } from '@/modules/users/hooks/use-org';

import type { OpsPulseKey } from './nav-config';

/**
 * The shell's live "needs my attention" counters — paid orders waiting to
 * ship, returns waiting to be processed, variants that run out before a
 * restock lands, and marketplace channels that need attention. App-layer
 * composition over existing module queries (the count rides each list's
 * PageMeta.total at pageSize 1; the reorder query is the exact key Pandu
 * already keeps warm, so the cache is shared). The marketplace health query
 * only runs for users who can see the section (else it 403s).
 */
export function useOpsPulse(): Partial<Record<OpsPulseKey, number>> {
  const orders = useOrdersQuery(1, 1, { status: 'PAID' });
  const returns = useReturnsQuery('PENDING', 1, 1);
  const reorder = useReorderReportQuery({
    windowDays: REORDER_DEFAULTS.windowDays,
    leadTimeDays: REORDER_DEFAULTS.leadTimeDays,
    targetCoverDays: REORDER_DEFAULTS.targetCoverDays,
  });
  const { allowed: canViewMarketplace } = useHasPermission('marketplace.view');
  const marketplaceHealth = useMarketplaceHealthQuery(canViewMarketplace);

  const marketplaceUnhealthy = canViewMarketplace
    ? marketplaceHealth.data?.filter((item) => item.tone === 'danger').length
    : undefined;

  return {
    ordersToShip: orders.data?.meta.total,
    returnsPending: returns.data?.meta.total,
    restockUrgent: reorder.data?.summary.urgentCount,
    marketplaceUnhealthy,
  };
}
