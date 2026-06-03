import { StockLedgerReason } from '@prisma/client';

/**
 * Ledger reasons that represent real customer demand, used to measure sales
 * velocity. `ORDER_RESERVE` removes units for a sale (negative delta);
 * `ORDER_RELEASE` adds them back on cancel/return (positive delta), so a net of
 * the two is true demand. `ORDER_SHIP` is intentionally EXCLUDED: once the
 * reserve→ship lifecycle lands it would double-count units already counted at
 * reserve time. This is the single place to revisit when that lifecycle ships.
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

/**
 * Days the variant has actually been sellable inside the window. A variant that
 * has existed for 3 days must not have its sales averaged over a 30-day window —
 * that would understate its true velocity. Always at least 1 to avoid div-by-0.
 */
export function effectiveWindowDays(windowDays: number, variantAgeDays: number): number {
  const existedDays = Math.ceil(variantAgeDays);
  return Math.max(1, Math.min(windowDays, existedDays));
}

/** Average units sold per day. Zero when nothing measurable sold. */
export function computeVelocity(unitsSold: number, effectiveDays: number): number {
  if (effectiveDays <= 0 || unitsSold <= 0) return 0;
  return unitsSold / effectiveDays;
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
 * also cover the backlog.
 */
export function computeReorderQty(params: {
  available: number;
  incoming: number;
  dailyVelocity: number;
  leadTimeDays: number;
  targetCoverDays: number;
}): number {
  const { available, incoming, dailyVelocity, leadTimeDays, targetCoverDays } = params;
  if (dailyVelocity <= 0) return 0;

  const targetUnits = dailyVelocity * (leadTimeDays + targetCoverDays);
  const need = targetUnits - (available + incoming);
  if (need <= 0) return 0;
  return Math.ceil(need);
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
