import type { ProductExportRow } from '../types';

/**
 * The canonical bulk product CSV columns, in order. Shared by the export
 * serializer and the import parser so the format round-trips: export → edit in a
 * spreadsheet → re-import. `field` is the internal key; `header` is the id-ID
 * column name written/expected in the file (import matches headers leniently —
 * case-insensitive, order-independent — so users can drop extra columns).
 */
export const PRODUCT_CSV_COLUMNS = [
  { field: 'productName', header: 'Nama Produk' },
  { field: 'category', header: 'Kategori' },
  { field: 'description', header: 'Deskripsi' },
  { field: 'variantGroup', header: 'Grup Varian' },
  { field: 'variantName', header: 'Nama Varian' },
  { field: 'sku', header: 'SKU' },
  { field: 'barcode', header: 'Barcode' },
  { field: 'price', header: 'Harga' },
  { field: 'cost', header: 'Modal' },
  { field: 'stock', header: 'Stok' },
] as const;

export type ProductCsvField = (typeof PRODUCT_CSV_COLUMNS)[number]['field'];

export const PRODUCT_CSV_HEADERS = PRODUCT_CSV_COLUMNS.map((column) => column.header);

/** Safety cap so a huge catalog can't pull the whole table into one response. */
export const PRODUCT_EXPORT_CAP = 50_000;

/** Quote a field only when it contains a comma, quote, or newline (RFC 4180). */
function escapeCsv(value: string): string {
  if (/["\n\r,]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Serialize export rows to CSV (header first, CRLF line endings, for spreadsheets). */
export function productsToCsv(rows: ProductExportRow[]): string {
  const lines = rows.map((row) =>
    [
      row.productName,
      row.category ?? '',
      row.description ?? '',
      row.variantGroup ?? '',
      row.variantName,
      row.sku,
      row.barcode ?? '',
      row.price,
      row.cost ?? '',
      String(row.stock),
    ]
      .map(escapeCsv)
      .join(','),
  );

  return [PRODUCT_CSV_HEADERS.join(','), ...lines].join('\r\n');
}
