/**
 * The canonical bulk-product spreadsheet columns, in order. Shared by the XLSX
 * export + template builders and the import parser so the format round-trips:
 * export → edit in Excel → re-import. `field` is the internal key; `header` is the
 * id-ID column name; `required` marks a column that must be present in an uploaded
 * file (template validation) and whose value is required to CREATE a new variant.
 * Header matching on import is lenient — case-insensitive, order-independent, and
 * extra columns are ignored.
 */
export const PRODUCT_CSV_COLUMNS = [
  { field: 'productName', header: 'Nama Produk', required: true },
  { field: 'category', header: 'Kategori', required: false },
  { field: 'description', header: 'Deskripsi', required: false },
  { field: 'variantGroup', header: 'Grup Varian', required: false },
  { field: 'variantName', header: 'Nama Varian', required: true },
  { field: 'sku', header: 'SKU', required: false },
  { field: 'barcode', header: 'Barcode', required: false },
  { field: 'price', header: 'Harga', required: true },
  { field: 'cost', header: 'Modal', required: false },
  { field: 'stock', header: 'Stok', required: false },
] as const;

export type ProductCsvField = (typeof PRODUCT_CSV_COLUMNS)[number]['field'];

export const PRODUCT_CSV_HEADERS = PRODUCT_CSV_COLUMNS.map((column) => column.header);

/** Template header — required columns marked with a trailing "*" (e.g. "Nama Produk*"). */
export const PRODUCT_TEMPLATE_HEADERS = PRODUCT_CSV_COLUMNS.map((column) =>
  column.required ? `${column.header}*` : column.header,
);

/** Columns that must be present in an uploaded file (and whose cell is required on create). */
export const REQUIRED_PRODUCT_CSV_COLUMNS = PRODUCT_CSV_COLUMNS.filter((column) => column.required);

/** Quote a field only when it contains a comma, quote, or newline (RFC 4180). */
function escapeCsv(value: string): string {
  if (/["\n\r,]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serialize editable rows back to CSV (canonical plain header, CRLF) — the import
 * wizard rebuilds this from its in-memory rows to send to the server on commit.
 */
export function rowsToImportCsv(rows: Record<ProductCsvField, string>[]): string {
  const lines = rows.map((row) =>
    PRODUCT_CSV_COLUMNS.map((column) => escapeCsv(row[column.field] ?? '')).join(','),
  );
  return [PRODUCT_CSV_HEADERS.join(','), ...lines].join('\r\n');
}

/** Safety cap so a huge catalog can't pull the whole table into one response. */
export const PRODUCT_EXPORT_CAP = 50_000;

/** Max data rows accepted in one import (bounds memory + keeps the request sync). */
export const MAX_IMPORT_ROWS = 2_000;

/** Max raw CSV payload size (bytes/chars) accepted by the import endpoint (~2MB). */
export const MAX_IMPORT_CSV_LENGTH = 2_000_000;
