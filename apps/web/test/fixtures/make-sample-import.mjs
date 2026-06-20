// Generate a sample product-import .xlsx for manual testing of the bulk importer.
// Run from the repo root:  node apps/web/test/fixtures/make-sample-import.mjs
// (xlsx resolves from apps/web/node_modules; output is written under docs/samples/.)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';

import * as XLSX from 'xlsx';

// Required columns carry a trailing "*" — exactly like the in-app downloaded template.
const HEADER = [
  'Nama Produk*',
  'Kategori',
  'Deskripsi',
  'Grup Varian',
  'Nama Varian',
  'SKU',
  'Barcode',
  'Harga*',
  'Modal',
  'Stok',
];

// Each row: [productName, category, description, variantGroup, variantName, sku, barcode, price, cost, stock]
const ROWS = [
  // 1) New standalone product (explicit SKU + stock + cost).
  [
    'Kaos Polos',
    'Apparel',
    'Bahan katun combed',
    '',
    'Default',
    'KP-001',
    '899000001',
    75000,
    40000,
    20,
  ],

  // 2) New product with grouped subvariants (same Grup Varian).
  ['Sepatu Lari', 'Sepatu', 'Ringan', 'Ukuran', '42', 'SL-42', '', 350000, 250000, 5],
  ['Sepatu Lari', 'Sepatu', 'Ringan', 'Ukuran', '43', 'SL-43', '', 350000, 250000, 3],

  // 3) New product with BLANK SKU → the importer auto-generates one (badge "auto").
  ['Topi Bucket', 'Aksesoris', '', '', 'Default', '', '', 50000, 25000, 10],

  // 4) Duplicate SKU in the file → BOTH rows are flagged "SKU duplikat dalam file".
  ['Botol Minum Biru', 'Aksesoris', '', '', 'Default', 'BTL-1', '', 30000, 15000, 12],
  ['Botol Minum Merah', 'Aksesoris', '', '', 'Default', 'BTL-1', '', 32000, 16000, 8],

  // 5) Error: required Harga is empty.
  ['Tas Selempang', 'Tas', '', '', 'Default', 'TS-9', '', '', 60000, 4],

  // 6) Error: required Nama Produk is empty.
  ['', '', '', '', 'Varian Tanpa Produk', 'NP-X', '', 10000, '', 1],
];

const sheet = XLSX.utils.aoa_to_sheet([HEADER, ...ROWS]);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, sheet, 'Produk');

const outDir = join(cwd(), 'docs', 'samples');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'produk-contoh-import.xlsx');
writeFileSync(outPath, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

console.log(`Wrote ${outPath} (${ROWS.length} data rows)`);
