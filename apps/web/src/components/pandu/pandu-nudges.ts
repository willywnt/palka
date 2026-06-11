'use client';

import type { Route } from 'next';

import { REORDER_DEFAULTS } from '@/modules/inventory/config';
import {
  useInventoryDashboardQuery,
  useReorderReportQuery,
} from '@/modules/inventory/hooks/use-inventory';
import { formatCurrency } from '@/lib/formatters';
import { usePanduStore } from '@/store/pandu-store';

/**
 * One proactive Pandu note. STUB CONTRACT (jujur): every number is REAL data
 * from queries the app already serves; only the prioritization is rule-based.
 * No generated prose, no fake intelligence — when the real assistant lands,
 * this selector is the single piece that gets swapped.
 */
export type PanduNudge = {
  /** Stable per-datum id — dismissal re-arms when the underlying number changes. */
  id: string;
  tone: 'urgent' | 'info';
  text: string;
  actionLabel: string;
  href: Route;
};

const MAX_NUDGES = 3;

export function usePanduNudges() {
  const dashboard = useInventoryDashboardQuery();
  const reorder = useReorderReportQuery({
    windowDays: REORDER_DEFAULTS.windowDays,
    leadTimeDays: REORDER_DEFAULTS.leadTimeDays,
    targetCoverDays: REORDER_DEFAULTS.targetCoverDays,
  });
  const dismissedNudgeIds = usePanduStore((state) => state.dismissedNudgeIds);
  const dismissNudge = usePanduStore((state) => state.dismissNudge);

  const candidates: PanduNudge[] = [];

  const reorderSummary = reorder.data?.summary;
  if (reorderSummary && reorderSummary.urgentCount > 0) {
    const topUrgent = reorder.data?.items.find((item) => item.status === 'URGENT');
    const days =
      topUrgent?.daysOfCover != null ? Math.max(0, Math.round(topUrgent.daysOfCover)) : null;
    const others = reorderSummary.urgentCount - 1;
    candidates.push({
      id: `reorder-urgent:${reorderSummary.urgentCount}:${topUrgent?.variantId ?? 'none'}`,
      tone: 'urgent',
      text: topUrgent
        ? `Stok ${topUrgent.productName} ${topUrgent.variantName} habis ${days != null ? `±${days} hari lagi` : 'sebelum restok datang'} (sisa ${topUrgent.availableStock})${others > 0 ? ` — plus ${others} varian lain` : ''}. Buatkan PO?`
        : `${reorderSummary.urgentCount} varian bakal habis sebelum restok datang. Buatkan PO?`,
      actionLabel: 'Buat PO',
      href: '/dashboard/purchasing/new',
    });
  }

  const invSummary = dashboard.data?.summary;
  if (invSummary && invSummary.oversoldCount > 0) {
    candidates.push({
      id: `oversold:${invSummary.oversoldCount}`,
      tone: 'urgent',
      text: `${invSummary.oversoldCount} varian oversold — stok sistem minus. Rapikan selisihnya sebelum numpuk.`,
      actionLabel: 'Cek inventaris',
      href: '/dashboard/inventory',
    });
  }

  if (invSummary && invSummary.lowStockCount > 0) {
    candidates.push({
      id: `lowstock:${invSummary.lowStockCount}`,
      tone: 'info',
      text: `${invSummary.lowStockCount} varian menipis di bawah batas stoknya.`,
      actionLabel: 'Lihat stok',
      href: '/dashboard/inventory?low=1' as Route,
    });
  }

  if (reorderSummary && reorderSummary.deadStockCount > 0) {
    candidates.push({
      id: `deadstock:${reorderSummary.deadStockCount}:${reorderSummary.deadStockValue}`,
      tone: 'info',
      text: `${formatCurrency(reorderSummary.deadStockValue)} modal mengendap di ${reorderSummary.deadStockCount} varian tanpa penjualan ${REORDER_DEFAULTS.deadStockDays} hari.`,
      actionLabel: 'Lihat saran',
      href: '/dashboard/inventory/reorder',
    });
  }

  const nudges = candidates.filter((n) => !dismissedNudgeIds.includes(n.id)).slice(0, MAX_NUDGES);

  return {
    nudges,
    hasUrgent: nudges.some((n) => n.tone === 'urgent'),
    isLoading: dashboard.isLoading || reorder.isLoading,
    isError: Boolean(dashboard.error ?? reorder.error),
    dismissNudge,
  };
}
