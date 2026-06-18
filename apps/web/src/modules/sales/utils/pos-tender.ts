/**
 * Cash-tender helpers for the POS terminal — pure client math for the change
 * calculator's quick-tender row. Never sent to the server.
 */

/** Common rupiah notes for the quick-tender row, smallest first. */
export const CASH_DENOMINATIONS = [10_000, 20_000, 50_000, 100_000, 200_000, 500_000];

/**
 * The (up to) 3 smallest common notes that still cover `total` — the cashier's
 * quick-tender shortcuts. Returns fewer when the total exceeds the larger notes.
 */
export function computeQuickTenderValues(total: number): number[] {
  return CASH_DENOMINATIONS.filter((value) => value >= total).slice(0, 3);
}
