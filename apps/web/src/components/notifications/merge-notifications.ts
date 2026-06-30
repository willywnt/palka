import type { AppNotification } from './types';

function toneRank(tone: AppNotification['tone']): number {
  return tone === 'urgent' ? 0 : 1;
}

/**
 * Merge the two tray tiers into ONE list as two honest bands:
 *  1. LIVE DERIVED signals (the rolled-up "needs my attention" counts — oversold, restock, …) lead,
 *     urgent among them first. These are recomputed every render, so they're never stale.
 *  2. The PERSISTED EVENT FEED follows in strict chronological order (already newest-first from the
 *     server) and is NEVER reordered by tone — so a stale urgent EVENT (e.g. an import that failed)
 *     can't float above its own newer resolution (the retry that succeeded). Urgency on a persisted
 *     event still reads via its inline alert icon + the red bell badge — surfaced, just not by
 *     position. A derived signal already covered by a persisted row (id === dedupeKey) is dropped so
 *     the tiers never double up.
 */
export function mergeNotificationFeeds(
  persisted: AppNotification[],
  derived: AppNotification[],
  persistedDedupeKeys: ReadonlySet<string>,
): AppNotification[] {
  const fresh = derived.filter((item) => !persistedDedupeKeys.has(item.id));
  const derivedSorted = [...fresh].sort((a, b) => toneRank(a.tone) - toneRank(b.tone));
  return [...derivedSorted, ...persisted];
}
