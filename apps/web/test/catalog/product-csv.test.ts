import { describe, expect, it } from 'vitest';

import { PRODUCT_CSV_HEADERS, productsToCsv } from '@/modules/catalog/utils/product-csv';
import type { ProductExportRow } from '@/modules/catalog/types';

function exportRow(overrides: Partial<ProductExportRow> = {}): ProductExportRow {
  return {
    productName: 'Kaos',
    category: 'Apparel',
    description: null,
    variantGroup: null,
    variantName: 'Default',
    sku: 'KAOS-1',
    barcode: null,
    price: '50000.00',
    cost: '30000.00',
    stock: 12,
    ...overrides,
  };
}

describe('productsToCsv', () => {
  it('writes the header first, then one CRLF-delimited line per row', () => {
    const csv = productsToCsv([exportRow()]);
    const lines = csv.split('\r\n');

    expect(lines[0]).toBe(PRODUCT_CSV_HEADERS.join(','));
    expect(lines[1]).toBe('Kaos,Apparel,,,Default,KAOS-1,,50000.00,30000.00,12');
  });

  it('renders null optional fields as empty cells', () => {
    const csv = productsToCsv([
      exportRow({ category: null, description: null, barcode: null, cost: null, stock: 0 }),
    ]);

    expect(csv.split('\r\n')[1]).toBe('Kaos,,,,Default,KAOS-1,,50000.00,,0');
  });

  it('quotes fields with a comma, quote, or newline and doubles inner quotes (RFC4180)', () => {
    const line = productsToCsv([
      exportRow({
        productName: 'Meja, Kayu',
        description: 'Kuat "banget"',
        variantName: 'Baris1\nBaris2',
      }),
    ]).split('\r\n')[1];

    expect(line).toContain('"Meja, Kayu"');
    expect(line).toContain('"Kuat ""banget"""');
    expect(line).toContain('"Baris1\nBaris2"');
  });
});
