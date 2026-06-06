import { describe, expect, it } from 'vitest';

import type { StockActivityItem } from '@/modules/inventory/types';
import { stockActivityToCsv } from '@/modules/inventory/utils/stock-activity-csv';

function item(overrides: Partial<StockActivityItem> = {}): StockActivityItem {
  return {
    id: 'led_1',
    variantId: 'var_1',
    productId: 'prod_1',
    productName: 'Kaos Polos',
    variantName: 'Black / M',
    sku: 'KAOS-BLK-M',
    imageUrl: null,
    delta: 5,
    balanceAfter: 15,
    reason: 'RESTOCK',
    source: 'MANUAL',
    referenceId: null,
    note: null,
    createdAt: '2026-06-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('stockActivityToCsv', () => {
  it('starts with the header row', () => {
    const csv = stockActivityToCsv([]);
    expect(csv).toBe('Date,Product,Variant,SKU,Reason,Source,Delta,Balance after,Reference,Note');
  });

  it('renders a row with the reason label and stringified numbers', () => {
    const csv = stockActivityToCsv([item()]);
    const [, row] = csv.split('\r\n');
    expect(row).toBe(
      '2026-06-01T10:00:00.000Z,Kaos Polos,Black / M,KAOS-BLK-M,Restock,MANUAL,5,15,,',
    );
  });

  it('keeps a negative delta sign', () => {
    const csv = stockActivityToCsv([item({ delta: -3, balanceAfter: 12 })]);
    expect(csv).toContain(',-3,12,');
  });

  it('quotes and escapes fields containing commas, quotes, or newlines', () => {
    const csv = stockActivityToCsv([
      item({ note: 'damaged, returned', productName: 'Say "hi"', variantName: 'line1\nline2' }),
    ]);
    expect(csv).toContain('"Say ""hi"""');
    expect(csv).toContain('"damaged, returned"');
    expect(csv).toContain('"line1\nline2"');
  });

  it('uses CRLF line endings between rows', () => {
    const csv = stockActivityToCsv([item(), item({ id: 'led_2' })]);
    expect(csv.split('\r\n')).toHaveLength(3);
  });
});
