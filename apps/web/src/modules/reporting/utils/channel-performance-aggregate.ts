import type {
  ChannelPerformanceReport,
  ChannelPerformanceRow,
  ChannelTrendPeriod,
  ProfitChannel,
  ProfitPeriodGranularity,
} from '../types';
import {
  addLine,
  money,
  newAcc,
  periodKey,
  round2,
  toMetrics,
  type Acc,
  type SoldLine,
} from './metrics';

/** Transactions per channel: completed POS sales / shipped-or-completed orders in range. */
export type TransactionsByChannel = Partial<Record<ProfitChannel, number>>;

function pct(part: number, whole: number): number | null {
  return whole > 0 ? round2((part / whole) * 100) : null;
}

/**
 * Per-channel performance over the same realized-sales lines the profit report
 * uses (net of processed returns). Adds the dimensions the flat profit byChannel
 * omits: revenue share, transactions + average order value, refunds + return rate,
 * and a channel × period revenue trend. `transactions` is counted upstream (one
 * per POS sale / marketplace order) since a SoldLine is per-item, not per-order.
 */
export function aggregateChannelPerformance(
  lines: SoldLine[],
  transactions: TransactionsByChannel,
  opts: { from: Date; to: Date; groupBy: ProfitPeriodGranularity },
): ChannelPerformanceReport {
  const accByChannel = new Map<ProfitChannel, Acc>();
  const refundByChannel = new Map<ProfitChannel, number>();
  // period -> (channel -> net revenue) for the trend matrix, plus a per-period total.
  const trendByPeriod = new Map<string, { byChannel: Map<ProfitChannel, number>; total: number }>();

  for (const line of lines) {
    const acc = accByChannel.get(line.channel) ?? newAcc();
    addLine(acc, line);
    accByChannel.set(line.channel, acc);

    const revenue = line.unitPrice * line.quantity;
    if (line.quantity < 0) {
      refundByChannel.set(line.channel, (refundByChannel.get(line.channel) ?? 0) - revenue);
    }

    const pk = periodKey(line.date, opts.groupBy);
    const period = trendByPeriod.get(pk) ?? {
      byChannel: new Map<ProfitChannel, number>(),
      total: 0,
    };
    period.byChannel.set(line.channel, (period.byChannel.get(line.channel) ?? 0) + revenue);
    period.total += revenue;
    trendByPeriod.set(pk, period);
  }

  const totalNetRevenue = [...accByChannel.values()].reduce(
    (sum, acc) => sum + acc.grossRevenue,
    0,
  );

  const byChannel: ChannelPerformanceRow[] = [...accByChannel.entries()]
    .map(([channel, acc]) => {
      const metrics = toMetrics(acc);
      const refunded = refundByChannel.get(channel) ?? 0;
      const grossSales = acc.grossRevenue + refunded; // net = grossSales − refunded
      const txns = transactions[channel] ?? 0;
      return {
        ...metrics,
        channel,
        revenueSharePct: pct(acc.grossRevenue, totalNetRevenue),
        transactions: txns,
        avgOrderValue: money(txns > 0 ? acc.grossRevenue / txns : 0),
        refundedRevenue: money(refunded),
        returnRatePct: pct(refunded, grossSales),
      };
    })
    .sort((a, b) => Number(b.grossRevenue) - Number(a.grossRevenue));

  const trend: ChannelTrendPeriod[] = [...trendByPeriod.entries()]
    .map(([period, data]) => ({
      period,
      revenueByChannel: Object.fromEntries(
        [...data.byChannel.entries()].map(([channel, revenue]) => [channel, money(revenue)]),
      ),
      total: money(data.total),
    }))
    .sort((a, b) => a.period.localeCompare(b.period));

  const totalGrossProfit = byChannel.reduce((sum, row) => sum + Number(row.grossProfit), 0);
  const totalCostKnownRevenue = byChannel.reduce(
    (sum, row) => sum + Number(row.costKnownRevenue),
    0,
  );
  const withMargin = byChannel.filter((row) => row.grossMarginPct != null);
  const topByMargin =
    withMargin.length > 0
      ? withMargin.reduce((best, row) =>
          (row.grossMarginPct ?? 0) > (best.grossMarginPct ?? 0) ? row : best,
        ).channel
      : null;

  return {
    range: { from: opts.from.toISOString(), to: opts.to.toISOString(), groupBy: opts.groupBy },
    summary: {
      totalGrossRevenue: money(totalNetRevenue),
      totalGrossProfit: money(totalGrossProfit),
      grossMarginPct: pct(totalGrossProfit, totalCostKnownRevenue),
      transactions: byChannel.reduce((sum, row) => sum + row.transactions, 0),
      activeChannels: byChannel.length,
      topByRevenue: byChannel[0]?.channel ?? null,
      topByMargin,
    },
    byChannel,
    trend,
  };
}
