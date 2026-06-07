import { describe, expect, it } from 'vitest';

import { allocateBundleUnitAmounts } from '@/modules/catalog/utils/bundle-allocation';

const sumLines = (units: number[], quantities: number[]) =>
  units.reduce((sum, unit, index) => sum + unit * quantities[index]!, 0);

describe('allocateBundleUnitAmounts', () => {
  it('returns [] for no components', () => {
    expect(allocateBundleUnitAmounts(10000, [])).toEqual([]);
  });

  it('splits proportionally to per-unit weight', () => {
    // total 30000; weights 100 & 200 (qty 1 each) → 1:2 → 10000, 20000
    expect(
      allocateBundleUnitAmounts(30000, [
        { weightMinor: 100, quantity: 1 },
        { weightMinor: 200, quantity: 1 },
      ]),
    ).toEqual([10000, 20000]);
  });

  it('weights are per-unit, independent of quantity', () => {
    // equal per-unit weight → equal unit price regardless of qty
    const units = allocateBundleUnitAmounts(30000, [
      { weightMinor: 100, quantity: 3 },
      { weightMinor: 100, quantity: 3 },
    ]);
    expect(units).toEqual([5000, 5000]);
    expect(sumLines(units, [3, 3])).toBe(30000);
  });

  it('splits equally per unit when all weights are zero', () => {
    const units = allocateBundleUnitAmounts(9000, [
      { weightMinor: 0, quantity: 2 },
      { weightMinor: 0, quantity: 1 },
    ]);
    expect(units).toEqual([3000, 3000]);
    expect(sumLines(units, [2, 1])).toBe(9000);
  });

  it('gives a zero-weight (free) component no value; the priced one absorbs the total', () => {
    const units = allocateBundleUnitAmounts(10000, [
      { weightMinor: 0, quantity: 1 },
      { weightMinor: 100, quantity: 1 },
    ]);
    expect(units).toEqual([0, 10000]);
  });

  it('puts the whole total on a single component', () => {
    expect(allocateBundleUnitAmounts(12345, [{ weightMinor: 500, quantity: 3 }])).toEqual([4115]);
  });

  it('is zero for a zero total', () => {
    expect(
      allocateBundleUnitAmounts(0, [
        { weightMinor: 100, quantity: 2 },
        { weightMinor: 50, quantity: 1 },
      ]),
    ).toEqual([0, 0]);
  });

  it('stays within a few minor units of the total even when not exactly divisible', () => {
    // 10000 / 3 units is not exact; assert bounded drift + determinism
    const components = [
      { weightMinor: 1, quantity: 1 },
      { weightMinor: 1, quantity: 1 },
      { weightMinor: 1, quantity: 1 },
    ];
    const units = allocateBundleUnitAmounts(10000, components);
    expect(units).toEqual([3333, 3333, 3333]);
    const drift = Math.abs(sumLines(units, [1, 1, 1]) - 10000);
    expect(drift).toBeLessThanOrEqual(components.length);
  });

  it('does not lose precision at large (Decimal(12,2)) magnitudes', () => {
    // 99,999,999.99 split 1:1 across two single-unit components
    const units = allocateBundleUnitAmounts(9_999_999_999, [
      { weightMinor: 1, quantity: 1 },
      { weightMinor: 1, quantity: 1 },
    ]);
    expect(units).toEqual([5_000_000_000, 5_000_000_000]);
  });
});
