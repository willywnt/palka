import { describe, expect, it } from 'vitest';

import { REORDER_DEFAULTS } from '@/modules/inventory/config';
import {
  classifyReorder,
  computeDaysOfCover,
  computeReorderQty,
  computeVelocity,
  effectiveWindowDays,
  netUnitsSold,
  SALES_LEDGER_REASONS,
} from '@/modules/inventory/utils/reorder-math';

/**
 * Locks in the reorder math driving the report: how raw ledger sums become
 * velocity, days-of-cover, a suggested reorder quantity, and an urgency bucket —
 * including the awkward cases (brand-new variants, oversold stock, returns,
 * dead stock with no demand).
 */
describe('SALES_LEDGER_REASONS', () => {
  it('counts reserve and release as demand, but never ship (avoids double-count)', () => {
    expect(SALES_LEDGER_REASONS).toContain('ORDER_RESERVE');
    expect(SALES_LEDGER_REASONS).toContain('ORDER_RELEASE');
    expect(SALES_LEDGER_REASONS).not.toContain('ORDER_SHIP');
  });
});

describe('netUnitsSold', () => {
  it('flips the sign of a negative ledger sum into positive units sold', () => {
    expect(netUnitsSold(-42)).toBe(42);
  });

  it('clamps to zero when returns outweigh sales (net positive sum)', () => {
    expect(netUnitsSold(5)).toBe(0);
  });

  it('treats a zero sum as no demand', () => {
    expect(netUnitsSold(0)).toBe(0);
  });
});

describe('effectiveWindowDays', () => {
  it('uses the full window once the variant is older than it', () => {
    expect(effectiveWindowDays(30, 90)).toBe(30);
  });

  it('shrinks to the variant age for a young variant', () => {
    expect(effectiveWindowDays(30, 3)).toBe(3);
  });

  it('rounds a fractional age up to a whole day', () => {
    expect(effectiveWindowDays(30, 2.4)).toBe(3);
  });

  it('never returns less than one day (brand-new variant)', () => {
    expect(effectiveWindowDays(30, 0)).toBe(1);
  });
});

describe('computeVelocity', () => {
  it('averages units sold across the effective window', () => {
    expect(computeVelocity(60, 30)).toBe(2);
  });

  it('is zero when nothing sold', () => {
    expect(computeVelocity(0, 30)).toBe(0);
  });

  it('is zero when the window collapses to nothing', () => {
    expect(computeVelocity(10, 0)).toBe(0);
  });
});

describe('computeDaysOfCover', () => {
  it('divides available stock by velocity', () => {
    expect(computeDaysOfCover(20, 2)).toBe(10);
  });

  it('returns null when there is no measurable demand', () => {
    expect(computeDaysOfCover(20, 0)).toBeNull();
  });

  it('returns zero when out of stock', () => {
    expect(computeDaysOfCover(0, 2)).toBe(0);
  });

  it('returns zero when oversold (negative available)', () => {
    expect(computeDaysOfCover(-5, 2)).toBe(0);
  });
});

describe('computeReorderQty', () => {
  const base = { dailyVelocity: 2, leadTimeDays: 7, targetCoverDays: 30 };

  it('orders up to the lead+target horizon, netting on-hand stock', () => {
    // target = 2 * (7 + 30) = 74; need = 74 - 10 = 64
    expect(computeReorderQty({ ...base, available: 10, incoming: 0 })).toBe(64);
  });

  it('subtracts stock already incoming', () => {
    // target 74; on-hand+incoming = 10 + 20 = 30; need = 44
    expect(computeReorderQty({ ...base, available: 10, incoming: 20 })).toBe(44);
  });

  it('suggests nothing when already above the horizon', () => {
    expect(computeReorderQty({ ...base, available: 100, incoming: 0 })).toBe(0);
  });

  it('covers the backlog when oversold', () => {
    // target 74; on-hand -6; need = 80
    expect(computeReorderQty({ ...base, available: -6, incoming: 0 })).toBe(80);
  });

  it('rounds fractional needs up to whole units', () => {
    // target = 1.5 * 37 = 55.5; need = 55.5 - 0 = 55.5 → 56
    expect(
      computeReorderQty({
        available: 0,
        incoming: 0,
        dailyVelocity: 1.5,
        leadTimeDays: 7,
        targetCoverDays: 30,
      }),
    ).toBe(56);
  });

  it('suggests nothing without demand', () => {
    expect(computeReorderQty({ ...base, dailyVelocity: 0, available: 0, incoming: 0 })).toBe(0);
  });
});

describe('classifyReorder', () => {
  const base = {
    leadTimeDays: 7,
    targetCoverDays: 30,
    variantAgeDays: 120,
    deadStockDays: REORDER_DEFAULTS.deadStockDays,
  };

  it('flags URGENT when cover is within the lead time', () => {
    expect(classifyReorder({ ...base, available: 10, dailyVelocity: 2, daysOfCover: 5 })).toBe(
      'URGENT',
    );
  });

  it('flags SOON below the reorder-up-to horizon', () => {
    expect(classifyReorder({ ...base, available: 40, dailyVelocity: 2, daysOfCover: 20 })).toBe(
      'SOON',
    );
  });

  it('is OK when comfortably above the horizon', () => {
    expect(classifyReorder({ ...base, available: 200, dailyVelocity: 2, daysOfCover: 100 })).toBe(
      'OK',
    );
  });

  it('flags DEAD when holding stock with no sales past the dead-stock age', () => {
    expect(classifyReorder({ ...base, available: 25, dailyVelocity: 0, daysOfCover: null })).toBe(
      'DEAD',
    );
  });

  it('is NO_DATA when there is no demand and the variant is still young', () => {
    expect(
      classifyReorder({
        ...base,
        variantAgeDays: 5,
        available: 25,
        dailyVelocity: 0,
        daysOfCover: null,
      }),
    ).toBe('NO_DATA');
  });

  it('is NO_DATA when there is no demand and no stock to strand', () => {
    expect(classifyReorder({ ...base, available: 0, dailyVelocity: 0, daysOfCover: null })).toBe(
      'NO_DATA',
    );
  });
});
