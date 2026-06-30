import { describe, expect, it } from 'vitest';

import { mergeNotificationFeeds } from '@/components/notifications/merge-notifications';
import type { AppNotification } from '@/components/notifications/types';
import { NOTIFICATION_TYPE_META, severityToTone } from '@/modules/notifications/notification-meta';
import { hiddenNotificationCategories } from '@/modules/notifications/notification-visibility';

function note(partial: Partial<AppNotification> & { id: string }): AppNotification {
  return {
    tone: 'info',
    title: partial.id,
    description: '',
    href: '/dashboard' as AppNotification['href'],
    read: false,
    ...partial,
  };
}

describe('mergeNotificationFeeds', () => {
  it('drops a derived signal already covered by a persisted row (by dedupeKey)', () => {
    const persisted = [note({ id: 'p1' })];
    const derived = [note({ id: 'oversold:3' }), note({ id: 'low-stock:2' })];
    const merged = mergeNotificationFeeds(persisted, derived, new Set(['oversold:3']));
    // Live derived signals lead, the persisted feed follows.
    expect(merged.map((item) => item.id)).toEqual(['low-stock:2', 'p1']);
  });

  it('leads with live derived signals (urgent first), then the persisted feed in given order', () => {
    const persisted = [
      note({ id: 'p-info', tone: 'info' }),
      note({ id: 'p-urgent', tone: 'urgent' }),
    ];
    const derived = [
      note({ id: 'd-info', tone: 'info' }),
      note({ id: 'd-urgent', tone: 'urgent' }),
    ];
    const merged = mergeNotificationFeeds(persisted, derived, new Set());
    // Derived tone-sorted (urgent first); persisted kept in its server order (chronological).
    expect(merged.map((item) => item.id)).toEqual(['d-urgent', 'd-info', 'p-info', 'p-urgent']);
  });

  it('keeps a stale urgent EVENT below its newer resolution (no tone-reorder of the persisted feed)', () => {
    // The server returns the persisted feed newest-first: a SUCCESS (info) above an older FAILED
    // (urgent) for the same import. The merge must NOT float the stale failure back to the top.
    const persisted = [
      note({ id: 'import-success', tone: 'info' }),
      note({ id: 'import-failed', tone: 'urgent' }),
    ];
    const merged = mergeNotificationFeeds(persisted, [], new Set());
    expect(merged.map((item) => item.id)).toEqual(['import-success', 'import-failed']);
  });

  it('returns the derived feed as-is when there are no persisted rows', () => {
    const derived = [note({ id: 'a' }), note({ id: 'b' })];
    expect(mergeNotificationFeeds([], derived, new Set()).map((item) => item.id)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('severityToTone', () => {
  it('maps URGENT to urgent and every other severity to info', () => {
    expect(severityToTone('URGENT')).toBe('urgent');
    expect(severityToTone('WARNING')).toBe('info');
    expect(severityToTone('INFO')).toBe('info');
    expect(severityToTone('SUCCESS')).toBe('info');
  });
});

describe('NOTIFICATION_TYPE_META', () => {
  it('classifies each Phase 1 producer type into the expected category', () => {
    expect(NOTIFICATION_TYPE_META.SALE_BELOW_COST.category).toBe('SALES');
    expect(NOTIFICATION_TYPE_META.PURCHASE_RECEIVED.category).toBe('PURCHASING');
    expect(NOTIFICATION_TYPE_META.RETURN_PROCESSED.category).toBe('RETURNS');
    expect(NOTIFICATION_TYPE_META.OPNAME_POSTED.category).toBe('INVENTORY');
    expect(NOTIFICATION_TYPE_META.ORDER_PLACED.category).toBe('ORDERS');
  });
});

describe('hiddenNotificationCategories', () => {
  const perms = (allowed: readonly string[]) => ({ has: (key: string) => allowed.includes(key) });

  it('hides PURCHASING + MARKETPLACE when both view permissions are absent (e.g. STAFF)', () => {
    expect(hiddenNotificationCategories(perms([]))).toEqual(['PURCHASING', 'MARKETPLACE']);
  });

  it('hides only PURCHASING when marketplace.view is present', () => {
    expect(hiddenNotificationCategories(perms(['marketplace.view']))).toEqual(['PURCHASING']);
  });

  it('hides nothing when both view permissions are present (e.g. OWNER)', () => {
    expect(hiddenNotificationCategories(perms(['purchasing.view', 'marketplace.view']))).toEqual(
      [],
    );
  });
});
