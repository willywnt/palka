import { describe, expect, it } from 'vitest';

import { CASH_DENOMINATIONS, computeQuickTenderValues } from '@/modules/sales/utils/pos-tender';

describe('computeQuickTenderValues', () => {
  it('returns the 3 smallest notes that cover a small total', () => {
    expect(computeQuickTenderValues(15_000)).toEqual([20_000, 50_000, 100_000]);
  });

  it('includes a note equal to the total (>= covers exact)', () => {
    expect(computeQuickTenderValues(20_000)).toEqual([20_000, 50_000, 100_000]);
  });

  it('drops notes smaller than the total', () => {
    expect(computeQuickTenderValues(120_000)).toEqual([200_000, 500_000]);
  });

  it('returns the single largest note when only it covers the total', () => {
    expect(computeQuickTenderValues(300_000)).toEqual([500_000]);
  });

  it('returns nothing when no common note covers the total', () => {
    expect(computeQuickTenderValues(600_000)).toEqual([]);
  });

  it('returns the 3 smallest notes for a zero total', () => {
    expect(computeQuickTenderValues(0)).toEqual([10_000, 20_000, 50_000]);
  });

  it('never returns more than 3 values', () => {
    expect(computeQuickTenderValues(0).length).toBeLessThanOrEqual(3);
  });

  it('exposes the denominations smallest-first', () => {
    expect(CASH_DENOMINATIONS).toEqual([10_000, 20_000, 50_000, 100_000, 200_000, 500_000]);
  });
});
