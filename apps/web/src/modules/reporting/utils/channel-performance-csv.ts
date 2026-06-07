import type { ChannelPerformanceRow } from '../types';
import { channelLabel } from './channel-label';

const HEADERS = [
  'Channel',
  'Net revenue',
  'Revenue share %',
  'COGS',
  'Gross profit',
  'Gross margin %',
  'Units sold',
  'Transactions',
  'Avg order value',
  'Refunded revenue',
  'Return rate %',
  'Cost-unknown lines',
] as const;

/** Quote a field only when it contains a comma, quote, or newline (RFC 4180). */
function escapeCsv(value: string): string {
  if (/["\n\r,]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Serialize per-channel performance rows to CSV (CRLF line endings). */
export function channelPerformanceToCsv(rows: ChannelPerformanceRow[]): string {
  const lines = rows.map((row) =>
    [
      channelLabel(row.channel),
      row.grossRevenue,
      row.revenueSharePct === null ? '' : String(row.revenueSharePct),
      row.cogs,
      row.grossProfit,
      row.grossMarginPct === null ? '' : String(row.grossMarginPct),
      String(row.unitsSold),
      String(row.transactions),
      row.avgOrderValue,
      row.refundedRevenue,
      row.returnRatePct === null ? '' : String(row.returnRatePct),
      String(row.costUnknownLines),
    ]
      .map(escapeCsv)
      .join(','),
  );

  return [HEADERS.join(','), ...lines].join('\r\n');
}
