import { describe, expect, it } from 'vitest';

import {
  PRODUCT_CSV_HEADERS,
  PRODUCT_TEMPLATE_HEADERS,
  rowsToImportCsv,
  type ProductCsvField,
} from '@/modules/catalog/utils/product-csv';

function row(
  overrides: Partial<Record<ProductCsvField, string>> = {},
): Record<ProductCsvField, string> {
  return {
    productName: 'Kaos',
    category: 'Apparel',
    description: '',
    variantGroup: '',
    variantName: 'Merah',
    sku: 'K-1',
    barcode: '',
    price: '50000',
    cost: '30000',
    stock: '5',
    ...overrides,
  };
}

describe('PRODUCT_TEMPLATE_HEADERS', () => {
  it('marks required columns with a trailing * and leaves optional ones plain', () => {
    expect(PRODUCT_TEMPLATE_HEADERS).toContain('Nama Produk*');
    expect(PRODUCT_TEMPLATE_HEADERS).toContain('Nama Varian*');
    expect(PRODUCT_TEMPLATE_HEADERS).toContain('Harga*');
    expect(PRODUCT_TEMPLATE_HEADERS).toContain('Kategori');
    expect(PRODUCT_TEMPLATE_HEADERS).not.toContain('SKU*');
  });
});

describe('rowsToImportCsv', () => {
  it('writes the plain header then one CRLF line per row, in column order', () => {
    const csv = rowsToImportCsv([row()]);
    const lines = csv.split('\r\n');

    expect(lines[0]).toBe(PRODUCT_CSV_HEADERS.join(','));
    expect(lines[1]).toBe('Kaos,Apparel,,,Merah,K-1,,50000,30000,5');
  });

  it('escapes commas and quotes (RFC4180)', () => {
    const line = rowsToImportCsv([row({ productName: 'Meja, Kayu', variantName: 'a "b"' })]).split(
      '\r\n',
    )[1];

    expect(line).toContain('"Meja, Kayu"');
    expect(line).toContain('"a ""b"""');
  });
});
