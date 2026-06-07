import { StockLedgerReason } from '@prisma/client';

/**
 * Reasons a user may pick for a *manual* stock adjustment. System-driven reasons
 * (ORDER_RESERVE/ORDER_RELEASE/ORDER_SHIP/MARKETPLACE_SYNC) are written by later
 * phases and must never be selectable from the manual-adjust API.
 */
export const MANUAL_STOCK_REASONS = [
  StockLedgerReason.RESTOCK,
  StockLedgerReason.MANUAL_ADJUST,
  StockLedgerReason.DAMAGE,
  StockLedgerReason.RECONCILE,
] as const;

export type ManualStockReason = (typeof MANUAL_STOCK_REASONS)[number];

export function isManualStockReason(reason: StockLedgerReason): boolean {
  return (MANUAL_STOCK_REASONS as readonly StockLedgerReason[]).includes(reason);
}

export type StockBalanceResult =
  | { ok: true; balanceAfter: number }
  | { ok: false; reason: 'zero_delta' | 'insufficient_stock' };

/**
 * Resulting available-stock balance after applying a signed delta. Available
 * stock can never go negative, and a zero delta is rejected (no-op adjustment).
 */
export function computeBalanceAfter(currentAvailable: number, delta: number): StockBalanceResult {
  if (delta === 0) return { ok: false, reason: 'zero_delta' };

  const balanceAfter = currentAvailable + delta;
  if (balanceAfter < 0) return { ok: false, reason: 'insufficient_stock' };

  return { ok: true, balanceAfter };
}

/**
 * Units a manual adjustment moves INTO the damaged bucket. Removing stock with
 * reason DAMAGE turns good units into damaged ones — available drops AND damaged
 * rises by the same amount; every other manual reason (or a positive delta)
 * leaves the damaged bucket untouched.
 */
export function damagedBucketDelta(reason: StockLedgerReason, delta: number): number {
  return reason === StockLedgerReason.DAMAGE && delta < 0 ? -delta : 0;
}

/**
 * Units a damage write-off can actually dispose: the requested quantity clamped to
 * what is in the damaged bucket (and never below zero). You can't write off more
 * damaged units than you hold.
 */
export function clampWriteOffQuantity(damagedStock: number, requested: number): number {
  return Math.min(Math.max(0, requested), Math.max(0, damagedStock));
}
