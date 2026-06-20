import { describe, expect, it } from 'vitest';

import { parseCsv, tableToRawRows } from '@/modules/catalog/utils/parse-products-csv';

describe('parseCsv', () => {
  it('parses simple rows; a trailing newline leaves one empty record', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2'], ['']]);
  });

  it('handles quoted commas, escaped quotes, embedded newlines, and CRLF', () => {
    const table = parseCsv('name,note\r\n"Meja, Kayu","a ""b"" c"\r\n"multi\nline",x');

    expect(table[1]).toEqual(['Meja, Kayu', 'a "b" c']);
    expect(table[2]).toEqual(['multi\nline', 'x']);
  });

  it('strips a leading UTF-8 BOM', () => {
    expect(parseCsv('﻿a,b\n1,2')[0]).toEqual(['a', 'b']);
  });
});

const HEADER =
  'Nama Produk,Kategori,Deskripsi,Grup Varian,Nama Varian,SKU,Barcode,Harga,Modal,Stok';

describe('tableToRawRows', () => {
  it('maps the canonical header and skips blank lines while keeping line numbers', () => {
    const text = `${HEADER}\nKaos,,,,Default,KAOS-1,,50000,30000,5\n\nSepatu,,,,Default,SEP-1,,150000,,2`;
    const { rows, error } = tableToRawRows(parseCsv(text));

    expect(error).toBeUndefined();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.line).toBe(2);
    expect(rows[0]?.sku).toBe('KAOS-1');
    // The blank line 3 is skipped but still consumes a line number.
    expect(rows[1]?.line).toBe(4);
    expect(rows[1]?.sku).toBe('SEP-1');
  });

  it('matches required headers case-insensitively, ignores order + extra columns', () => {
    const { rows, error } = tableToRawRows(
      parseCsv('nama varian,NAMA PRODUK,harga,Catatan Lain\nMerah,Kaos,1000,abaikan'),
    );

    expect(error).toBeUndefined();
    expect(rows[0]?.productName).toBe('Kaos');
    expect(rows[0]?.variantName).toBe('Merah');
    expect(rows[0]?.price).toBe('1000');
    expect(rows[0]?.sku).toBe(''); // optional column absent → empty
  });

  it('rejects a mismatched template (a required column is missing)', () => {
    const { rows, error } = tableToRawRows(parseCsv('Kategori,Harga\nApparel,1000'));

    expect(error).toMatch(/Template tidak sesuai/);
    expect(error).toMatch(/Nama Produk/);
    expect(rows).toHaveLength(0);
  });

  it('accepts template headers that mark required columns with a trailing *', () => {
    const { rows, error } = tableToRawRows(
      parseCsv('Nama Produk*,Nama Varian*,Harga*,SKU\nKaos,Merah,50000,K-1'),
    );

    expect(error).toBeUndefined();
    expect(rows[0]?.productName).toBe('Kaos');
    expect(rows[0]?.variantName).toBe('Merah');
    expect(rows[0]?.price).toBe('50000');
    expect(rows[0]?.sku).toBe('K-1');
  });
});
