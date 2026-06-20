import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { PRODUCT_CSV_HEADERS, PRODUCT_TEMPLATE_HEADERS } from '@/modules/catalog/utils/product-csv';
import { buildProductTemplateXlsx, buildProductsXlsx } from '@/modules/catalog/utils/product-xlsx';
import type { ProductExportRow } from '@/modules/catalog/types';

function readRows(bytes: ArrayBuffer): unknown[][] {
  const workbook = XLSX.read(bytes, { type: 'array' });
  const name = workbook.SheetNames[0];
  const sheet = name ? workbook.Sheets[name] : undefined;
  if (!sheet) throw new Error('workbook has no sheet');
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
}

describe('buildProductTemplateXlsx', () => {
  it('produces a single header row (required columns marked with *) and no data', () => {
    const rows = readRows(buildProductTemplateXlsx());

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual([...PRODUCT_TEMPLATE_HEADERS]);
    expect(rows[0]).toContain('Nama Produk*');
    expect(rows[0]).toContain('Kategori'); // optional column stays unmarked
  });
});

describe('buildProductsXlsx', () => {
  it('writes the header then one row per variant (numbers stay numeric)', () => {
    const row: ProductExportRow = {
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
    };

    const rows = readRows(buildProductsXlsx([row]));

    expect(rows[0]).toEqual([...PRODUCT_CSV_HEADERS]);
    expect(rows[1]?.[0]).toBe('Kaos');
    expect(rows[1]?.[5]).toBe('KAOS-1');
    expect(rows[1]?.[7]).toBe('50000.00');
    expect(rows[1]?.[9]).toBe(12);
  });
});
