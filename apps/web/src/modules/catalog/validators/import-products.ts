import { z } from 'zod';

import { MAX_IMPORT_CSV_LENGTH, MAX_IMPORT_ROWS } from '../utils/product-csv';

/**
 * Bulk product import payload. The raw CSV text is sent as a JSON string (apiFetch
 * is JSON-only) and bounded to keep the request synchronous + memory-safe.
 * `commit=false` is a dry-run that returns a validated preview without writing.
 */
export const importProductsSchema = z.object({
  csv: z
    .string()
    .min(1, 'File CSV kosong.')
    .max(MAX_IMPORT_CSV_LENGTH, 'File CSV terlalu besar (maks ~2MB).'),
  commit: z.boolean().default(false),
});

export type ImportProductsInput = z.infer<typeof importProductsSchema>;

/** Lookup payload for the preview: resolve which SKUs/product names already exist. */
export const resolveImportSchema = z.object({
  skus: z.array(z.string().max(128)).max(MAX_IMPORT_ROWS),
  names: z.array(z.string().max(256)).max(MAX_IMPORT_ROWS),
});

export type ResolveImportInput = z.infer<typeof resolveImportSchema>;
