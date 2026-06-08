import type { DailyMovementPoint } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC day key ("YYYY-MM-DD") for a date. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Bucket raw ledger rows into per-day in/out unit totals over a continuous
 * window: positive deltas sum into `in`, negative into `out` (as a positive
 * magnitude). Every day from `from` for `days` days is emitted (zero-filled,
 * oldest first) so the chart axis has no gaps. `from` must be a UTC midnight.
 */
export function aggregateDailyMovement(
  rows: Array<{ createdAt: Date; delta: number }>,
  from: Date,
  days: number,
): DailyMovementPoint[] {
  const buckets = new Map<string, { in: number; out: number }>();

  for (const row of rows) {
    const key = dayKey(row.createdAt);
    const bucket = buckets.get(key) ?? { in: 0, out: 0 };
    if (row.delta >= 0) bucket.in += row.delta;
    else bucket.out += -row.delta;
    buckets.set(key, bucket);
  }

  const start = from.getTime();
  return Array.from({ length: days }, (_, index) => {
    const key = dayKey(new Date(start + index * DAY_MS));
    const bucket = buckets.get(key) ?? { in: 0, out: 0 };
    return { date: key, in: bucket.in, out: bucket.out };
  });
}
