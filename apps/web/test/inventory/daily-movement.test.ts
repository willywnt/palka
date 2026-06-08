import { describe, expect, it } from 'vitest';

import { aggregateDailyMovement } from '@/modules/inventory/utils/daily-movement';

const from = new Date('2026-06-01T00:00:00.000Z');

describe('aggregateDailyMovement', () => {
  it('splits positive deltas into "in" and negative into "out" (as a magnitude)', () => {
    const rows = [
      { createdAt: new Date('2026-06-01T08:00:00Z'), delta: 10 },
      { createdAt: new Date('2026-06-01T09:00:00Z'), delta: -4 },
      { createdAt: new Date('2026-06-01T10:00:00Z'), delta: 5 },
    ];

    const result = aggregateDailyMovement(rows, from, 1);

    expect(result).toEqual([{ date: '2026-06-01', in: 15, out: 4 }]);
  });

  it('zero-fills every day in the window, oldest first', () => {
    const rows = [{ createdAt: new Date('2026-06-03T12:00:00Z'), delta: 7 }];

    const result = aggregateDailyMovement(rows, from, 3);

    expect(result).toEqual([
      { date: '2026-06-01', in: 0, out: 0 },
      { date: '2026-06-02', in: 0, out: 0 },
      { date: '2026-06-03', in: 7, out: 0 },
    ]);
  });

  it('ignores rows outside the emitted window', () => {
    const rows = [
      { createdAt: new Date('2026-05-30T12:00:00Z'), delta: 99 },
      { createdAt: new Date('2026-06-02T12:00:00Z'), delta: 3 },
    ];

    const result = aggregateDailyMovement(rows, from, 3);

    expect(result.find((point) => point.date === '2026-06-02')?.in).toBe(3);
    expect(result.some((point) => point.in === 99 || point.out === 99)).toBe(false);
  });
});
