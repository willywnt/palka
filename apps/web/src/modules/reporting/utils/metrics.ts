import type { ProfitChannel, ProfitMetrics, ProfitPeriodGranularity } from '../types';

/** A single realized sale line, normalized across POS and marketplace orders. */
export type SoldLine = {
  date: Date;
  channel: ProfitChannel;
  variantId: string | null;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unitCost: number | null;
};

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function money(value: number): string {
  return round2(value).toFixed(2);
}

/** A running revenue/COGS/units accumulator; `toMetrics` snapshots it. */
export type Acc = {
  grossRevenue: number;
  costKnownRevenue: number;
  cogs: number;
  units: number;
  costUnknownLines: number;
};

export function newAcc(): Acc {
  return { grossRevenue: 0, costKnownRevenue: 0, cogs: 0, units: 0, costUnknownLines: 0 };
}

/**
 * Fold one line into an accumulator. A line with an unknown cost still counts
 * toward revenue + units, but is EXCLUDED from COGS/margin so a missing cost
 * never invents fake profit. Negative-qty lines (return reversals) subtract.
 */
export function addLine(acc: Acc, line: SoldLine): void {
  const revenue = line.unitPrice * line.quantity;
  acc.grossRevenue += revenue;
  acc.units += line.quantity;

  if (line.unitCost == null) {
    acc.costUnknownLines += 1;
    return;
  }
  acc.costKnownRevenue += revenue;
  acc.cogs += line.unitCost * line.quantity;
}

export function toMetrics(acc: Acc): ProfitMetrics {
  const grossProfit = acc.costKnownRevenue - acc.cogs;
  return {
    grossRevenue: money(acc.grossRevenue),
    costKnownRevenue: money(acc.costKnownRevenue),
    cogs: money(acc.cogs),
    grossProfit: money(grossProfit),
    grossMarginPct:
      acc.costKnownRevenue > 0 ? round2((grossProfit / acc.costKnownRevenue) * 100) : null,
    unitsSold: acc.units,
    costUnknownLines: acc.costUnknownLines,
  };
}

/** ISO-8601 week key, e.g. "2026-W23". */
function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function periodKey(date: Date, groupBy: ProfitPeriodGranularity): string {
  if (groupBy === 'month') return date.toISOString().slice(0, 7);
  if (groupBy === 'week') return isoWeekKey(date);
  return date.toISOString().slice(0, 10);
}
