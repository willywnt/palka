import { describe, expect, it } from 'vitest';

import {
  aggregateChannelPerformance,
  type TransactionsByChannel,
} from '@/modules/reporting/utils/channel-performance-aggregate';
import type { SoldLine } from '@/modules/reporting/utils/metrics';

const opts = {
  from: new Date('2026-06-01'),
  to: new Date('2026-06-30'),
  groupBy: 'day' as const,
};

function line(overrides: Partial<SoldLine>): SoldLine {
  return {
    date: new Date('2026-06-10'),
    channel: 'POS',
    variantId: 'v',
    sku: 'SKU',
    name: 'Name',
    quantity: 1,
    unitPrice: 100,
    unitCost: 60,
    ...overrides,
  };
}

describe('aggregateChannelPerformance', () => {
  it('splits revenue/profit by channel, sorted by net revenue, with revenue share', () => {
    const txns: TransactionsByChannel = { POS: 2, SHOPEE: 1 };
    const report = aggregateChannelPerformance(
      [
        line({ channel: 'POS', quantity: 2, unitPrice: 100, unitCost: 60 }),
        line({ channel: 'SHOPEE', quantity: 1, unitPrice: 300, unitCost: 150 }),
      ],
      txns,
      opts,
    );

    expect(report.byChannel.map((row) => row.channel)).toEqual(['SHOPEE', 'POS']);

    const pos = report.byChannel.find((row) => row.channel === 'POS');
    expect(pos?.grossRevenue).toBe('200.00');
    expect(pos?.grossProfit).toBe('80.00');
    expect(pos?.grossMarginPct).toBe(40);
    expect(pos?.revenueSharePct).toBe(40); // 200 / 500

    const shopee = report.byChannel.find((row) => row.channel === 'SHOPEE');
    expect(shopee?.revenueSharePct).toBe(60); // 300 / 500
  });

  it('computes average order value from the transaction counts', () => {
    const report = aggregateChannelPerformance(
      [line({ channel: 'POS', quantity: 4, unitPrice: 100, unitCost: 60 })],
      { POS: 2 },
      opts,
    );

    // 400 net revenue / 2 transactions = 200 AOV.
    expect(report.byChannel[0]?.avgOrderValue).toBe('200.00');
    expect(report.byChannel[0]?.transactions).toBe(2);
  });

  it('reports "0.00" AOV when a channel has revenue but no counted transactions', () => {
    const report = aggregateChannelPerformance(
      [line({ channel: 'SHOPEE', quantity: 1, unitPrice: 300, unitCost: 150 })],
      {},
      opts,
    );

    expect(report.byChannel[0]?.avgOrderValue).toBe('0.00');
  });

  it('derives the return rate from refunded revenue over gross sales (pre-return)', () => {
    const report = aggregateChannelPerformance(
      [
        line({ channel: 'POS', quantity: 2, unitPrice: 100, unitCost: 60 }),
        line({ channel: 'POS', quantity: -1, unitPrice: 100, unitCost: 60 }),
      ],
      { POS: 2 },
      opts,
    );

    const pos = report.byChannel[0];
    expect(pos?.grossRevenue).toBe('100.00'); // 200 sold − 100 returned (net)
    expect(pos?.refundedRevenue).toBe('100.00');
    expect(pos?.returnRatePct).toBe(50); // 100 / (100 + 100) gross sales
  });

  it('picks the top channel by revenue and by margin independently', () => {
    const report = aggregateChannelPerformance(
      [
        // POS: big revenue, thin margin (20%).
        line({ channel: 'POS', quantity: 10, unitPrice: 100, unitCost: 80 }),
        // SHOPEE: small revenue, fat margin (60%).
        line({ channel: 'SHOPEE', quantity: 1, unitPrice: 100, unitCost: 40 }),
      ],
      { POS: 5, SHOPEE: 1 },
      opts,
    );

    expect(report.summary.topByRevenue).toBe('POS');
    expect(report.summary.topByMargin).toBe('SHOPEE');
  });

  it('builds a channel × period revenue trend, oldest period first', () => {
    const report = aggregateChannelPerformance(
      [
        line({ channel: 'POS', date: new Date('2026-06-10'), quantity: 1, unitPrice: 100 }),
        line({ channel: 'SHOPEE', date: new Date('2026-06-10'), quantity: 1, unitPrice: 200 }),
        line({ channel: 'POS', date: new Date('2026-06-11'), quantity: 1, unitPrice: 150 }),
      ],
      { POS: 2, SHOPEE: 1 },
      opts,
    );

    expect(report.trend.map((period) => period.period)).toEqual(['2026-06-10', '2026-06-11']);
    expect(report.trend[0]?.revenueByChannel.POS).toBe('100.00');
    expect(report.trend[0]?.revenueByChannel.SHOPEE).toBe('200.00');
    expect(report.trend[0]?.total).toBe('300.00');
    expect(report.trend[1]?.revenueByChannel.POS).toBe('150.00');
    expect(report.trend[1]?.total).toBe('150.00');
  });
});
