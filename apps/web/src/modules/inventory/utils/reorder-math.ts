import { StockLedgerReason } from '@prisma/client';

/**
 * Ledger reasons that represent real customer demand, used to measure sales
 * velocity. `ORDER_RESERVE` removes units for a sale (negative delta);
 * `ORDER_RELEASE` adds them back on cancel (positive delta), so a net of the two
 * is true demand. `ORDER_SHIP` is intentionally EXCLUDED: the reserve→ship
 * lifecycle records demand at reserve time, and ship rows carry a delta of 0
 * (they move on-hand, not available), so including them would be noise.
 */
export const SALES_LEDGER_REASONS = [
  StockLedgerReason.ORDER_RESERVE,
  StockLedgerReason.ORDER_RELEASE,
] as const;

export type ReorderStatus =
  | 'URGENT' // will run out before a restock could arrive (cover ≤ lead time)
  | 'SOON' // below the level you'd reorder up to — restock this cycle
  | 'OK' // comfortably stocked
  | 'DEAD' // holding stock but no sales for a long time — capital stuck
  | 'NO_DATA'; // no measurable demand yet (too new / never sold)

/**
 * Net units sold from a window's ledger sum. The ledger stores sales as negative
 * deltas, so a sale-window sum is negative; we flip the sign. Returns are added
 * back by `ORDER_RELEASE` (positive), so a net of zero-or-positive means no real
 * demand → clamped to 0.
 */
export function netUnitsSold(ledgerDeltaSum: number): number {
  const sold = -ledgerDeltaSum;
  return sold > 0 ? sold : 0;
}

/** Recency weight for a bucket (0 = most recent). decay = 1 → flat weights. */
export function bucketWeight(bucketIndex: number, decay: number): number {
  return decay ** bucketIndex;
}

/**
 * Sellable days for a variant inside one bucket. The bucket spans ages
 * `[newerEdgeDays, olderEdgeDays)` measured back from now; we clamp to the
 * variant's existence so buckets that predate it contribute nothing (a 3-day-old
 * variant isn't diluted by 30 days of "window").
 */
export function bucketEffectiveDays(
  variantAgeDays: number,
  newerEdgeDays: number,
  olderEdgeDays: number,
): number {
  const overlap = Math.min(olderEdgeDays, variantAgeDays) - newerEdgeDays;
  return overlap > 0 ? overlap : 0;
}

/**
 * Recency-weighted sales velocity (units/day). `buckets[0]` is the most recent
 * sub-window; `effectiveDays[b]` is that bucket's sellable days. Weighting both
 * the units and the days by the same recency factor means a younger variant or a
 * sales spike is reflected without dividing by dead time. With decay = 1 this is
 * a plain moving average.
 */
export function computeWeightedVelocity(
  buckets: number[],
  effectiveDays: number[],
  decay: number,
): number {
  let weightedSold = 0;
  let weightedDays = 0;

  for (let b = 0; b < buckets.length; b += 1) {
    const days = effectiveDays[b] ?? 0;
    if (days <= 0) continue;
    const sold = Math.max(0, buckets[b] ?? 0);
    const weight = bucketWeight(b, decay);
    weightedSold += weight * sold;
    weightedDays += weight * days;
  }

  if (weightedDays <= 0) return 0;
  return weightedSold / weightedDays;
}

/**
 * How many days the current available stock lasts at the measured velocity.
 * `null` = no measurable demand (effectively infinite cover); `0` = out of stock
 * or oversold.
 */
export function computeDaysOfCover(available: number, dailyVelocity: number): number | null {
  if (dailyVelocity <= 0) return null;
  if (available <= 0) return 0;
  return available / dailyVelocity;
}

/**
 * Units to reorder so that on-hand + incoming reaches the target horizon
 * (lead time + target cover) at the current velocity. Nets out stock already
 * incoming and rounds up. Oversold (negative available) raises the suggestion to
 * also cover the backlog. When a reorder is needed, the result is raised to the
 * minimum order quantity (MOQ) if one is set — MOQ never forces an order on its
 * own.
 */
export function computeReorderQty(params: {
  available: number;
  incoming: number;
  dailyVelocity: number;
  leadTimeDays: number;
  targetCoverDays: number;
  minOrderQty?: number;
}): number {
  const { available, incoming, dailyVelocity, leadTimeDays, targetCoverDays, minOrderQty } = params;
  if (dailyVelocity <= 0) return 0;

  const targetUnits = dailyVelocity * (leadTimeDays + targetCoverDays);
  const need = targetUnits - (available + incoming);
  if (need <= 0) return 0;

  const qty = Math.ceil(need);
  if (minOrderQty && minOrderQty > qty) return minOrderQty;
  return qty;
}

/**
 * Bucket a variant for the reorder report. Urgency is read from on-hand cover
 * (what the operator watches deplete); the suggested quantity nets incoming
 * separately, so a `SOON` row whose incoming already covers it can legitimately
 * suggest 0 units.
 */
export function classifyReorder(params: {
  available: number;
  dailyVelocity: number;
  daysOfCover: number | null;
  leadTimeDays: number;
  targetCoverDays: number;
  variantAgeDays: number;
  deadStockDays: number;
}): ReorderStatus {
  const {
    available,
    dailyVelocity,
    daysOfCover,
    leadTimeDays,
    targetCoverDays,
    variantAgeDays,
    deadStockDays,
  } = params;

  if (dailyVelocity <= 0) {
    if (available > 0 && variantAgeDays >= deadStockDays) return 'DEAD';
    return 'NO_DATA';
  }

  // velocity > 0 guarantees a finite cover, but stay defensive.
  if (daysOfCover === null) return 'NO_DATA';
  if (daysOfCover <= leadTimeDays) return 'URGENT';
  if (daysOfCover <= leadTimeDays + targetCoverDays) return 'SOON';
  return 'OK';
}
