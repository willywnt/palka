import * as XLSX from 'xlsx';

import type { ProductExportRow } from '../types';
import { PRODUCT_CSV_HEADERS, PRODUCT_TEMPLATE_HEADERS } from './product-csv';

const SHEET_NAME = 'Produk';

function rowToCells(row: ProductExportRow): (string | number)[] {
  return [
    row.productName,
    row.category ?? '',
    row.description ?? '',
    row.variantGroup ?? '',
    row.variantName,
    row.sku,
    row.barcode ?? '',
    row.price,
    row.cost ?? '',
    row.stock,
  ];
}

function workbookBytes(aoa: (string | number)[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, SHEET_NAME);
  // `type: 'array'` yields an ArrayBuffer — a clean Response BodyInit (a Node
  // Buffer / generic Uint8Array<ArrayBufferLike> is not, under current typings).
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

/** Full data workbook (header + one row per variant) as .xlsx bytes. */
export function buildProductsXlsx(rows: ProductExportRow[]): ArrayBuffer {
  return workbookBytes([PRODUCT_CSV_HEADERS, ...rows.map(rowToCells)]);
}

/** Header-only template workbook (required columns marked "*") as .xlsx bytes. */
export function buildProductTemplateXlsx(): ArrayBuffer {
  return workbookBytes([PRODUCT_TEMPLATE_HEADERS]);
}
