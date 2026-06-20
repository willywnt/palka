import {
  PRODUCT_CSV_COLUMNS,
  REQUIRED_PRODUCT_CSV_COLUMNS,
  type ProductCsvField,
} from './product-csv';

/**
 * Parse CSV text into a table of string rows (RFC 4180). Handles quoted fields,
 * embedded commas / quotes / newlines, a doubled `""` as an escaped quote, and
 * CRLF or LF line endings. Every record is preserved (including blank lines) so
 * callers can keep stable 1-based line numbers; a leading UTF-8 BOM is stripped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      endField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      endRow();
      i += text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (ch === '\n') {
      endRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // Flush the final field/row (no trailing newline case).
  endRow();
  return rows;
}

/** A raw CSV data row, columns resolved to the canonical fields (empty when absent). */
export type RawProductRow = Record<ProductCsvField, string> & { line: number };

export type RawProductTable = {
  rows: RawProductRow[];
  /** A blocking header problem (unrecognized columns) — when set, `rows` is empty. */
  error?: string;
  /** Which canonical columns the header matched (for diagnostics). */
  recognized: ProductCsvField[];
};

function isBlankRow(cells: string[]): boolean {
  return cells.every((cell) => cell.trim() === '');
}

/**
 * Map a parsed CSV table to canonical product rows. The header (line 1) is matched
 * leniently — case-insensitive, order-independent, extra columns ignored — against
 * {@link PRODUCT_CSV_COLUMNS}. The file is rejected ("template tidak sesuai") unless
 * every REQUIRED column is present. Blank lines are skipped but still consume a line
 * number so reports point at the right row in the file.
 */
export function tableToRawRows(table: string[][]): RawProductTable {
  const header = table[0] ?? [];
  const indexByField = new Map<ProductCsvField, number>();
  for (let col = 0; col < header.length; col += 1) {
    // Strip a trailing "*" — the template marks required columns as "Nama Produk*".
    const name = (header[col] ?? '').trim().replace(/\*+$/, '').trim().toLowerCase();
    const match = PRODUCT_CSV_COLUMNS.find((column) => column.header.toLowerCase() === name);
    if (match && !indexByField.has(match.field)) indexByField.set(match.field, col);
  }

  const recognized = [...indexByField.keys()];
  const missingRequired = REQUIRED_PRODUCT_CSV_COLUMNS.filter(
    (column) => !indexByField.has(column.field),
  );
  if (missingRequired.length > 0) {
    return {
      rows: [],
      recognized,
      error: `Template tidak sesuai — kolom wajib tidak ada: ${missingRequired
        .map((column) => column.header)
        .join(', ')}. Unduh template lalu coba lagi.`,
    };
  }

  const cell = (cells: string[], field: ProductCsvField): string => {
    const index = indexByField.get(field);
    return index === undefined ? '' : (cells[index] ?? '');
  };

  const rows: RawProductRow[] = [];
  for (let r = 1; r < table.length; r += 1) {
    const cells = table[r] ?? [];
    if (isBlankRow(cells)) continue;
    rows.push({
      line: r + 1, // 1-based; header is line 1.
      productName: cell(cells, 'productName'),
      category: cell(cells, 'category'),
      description: cell(cells, 'description'),
      variantGroup: cell(cells, 'variantGroup'),
      variantName: cell(cells, 'variantName'),
      sku: cell(cells, 'sku'),
      barcode: cell(cells, 'barcode'),
      price: cell(cells, 'price'),
      cost: cell(cells, 'cost'),
      stock: cell(cells, 'stock'),
    });
  }

  return { rows, recognized };
}
