import type { ProductImportField, ProductImportRowResult, ProductImportSummary } from '../types';
import type { CreateVariantInput } from '../validators/variant';
import type { UpdateVariantDetailsInput } from '../validators/update-variant-details';
import type { RawProductRow } from './parse-products-csv';
import { suggestVariantSku } from './variants';

/** Mirrors the caps in validators/variant.ts (kept local so the planner is pure + testable). */
const MAX_MONEY = 9_999_999_999;
const MAX_STOCK = 1_000_000_000;
const MAX_NAME = 200;
const MAX_GROUP = 200;
const MAX_BARCODE = 64;
const MAX_SKU = 64;

/** A grouped create: N variant rows that become one product (new, or added to an existing one). */
export type CreateGroup = {
  /** Source line numbers feeding this group (so the committer can map outcomes back). */
  lines: number[];
  /** Existing product to add the variants to; null = create a fresh product. */
  targetProductId: string | null;
  name: string;
  category?: string;
  description?: string;
  variants: CreateVariantInput[];
};

export type UpdateOp = {
  line: number;
  variantId: string;
  input: UpdateVariantDetailsInput;
};

export type ImportPlan = {
  rows: ProductImportRowResult[];
  createGroups: CreateGroup[];
  updates: UpdateOp[];
  summary: ProductImportSummary;
};

export type ImportPlanContext = {
  /** SKU → live variant. An exact match means the row UPDATES that variant. */
  existingVariantsBySku: Map<string, { variantId: string; productId: string }>;
  /** Product name → live product ids (exact). Used to route new variants. */
  existingProductIdsByName: Map<string, string[]>;
};

type ParsedNumber = { value?: number; error?: string };

function parseNumber(raw: string, max: number, integer: boolean): ParsedNumber {
  const text = raw.trim();
  if (text === '') return {};
  const value = Number(text);
  if (!Number.isFinite(value)) return { error: 'Bukan angka' };
  if (value < 0) return { error: 'Tidak boleh negatif' };
  if (integer && !Number.isInteger(value)) return { error: 'Harus bilangan bulat' };
  if (value > max) return { error: 'Terlalu besar' };
  return { value };
}

/** Make `base` unique against `used` by appending -2, -3, … ; reserves the result. */
function uniqueSku(base: string, used: Set<string>): string {
  const root = base || 'SKU';
  if (!used.has(root)) {
    used.add(root);
    return root;
  }
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${root}-${suffix}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

/**
 * Decide, per row, what the import will do — pure (no DB). Classify by SKU: an
 * exact match of a live variant = UPDATE its core fields (price/cost/name/barcode/
 * group); an unmatched/blank SKU = CREATE (blank SKUs auto-generate a unique one,
 * flagged `skuGenerated`). Create rows are grouped by product name and routed to an
 * existing product (1 match), a new product (0), or flagged ambiguous (≥2). Stock
 * only seeds NEW variants — a stock cell on an existing SKU is left to the UI to
 * show as ignored. Errors are attributed to the offending column (`fieldErrors`).
 */
export function planProductImport(rows: RawProductRow[], context: ImportPlanContext): ImportPlan {
  const resultByLine = new Map<number, ProductImportRowResult>();
  const updates: UpdateOp[] = [];
  const usedSkus = new Set(context.existingVariantsBySku.keys());

  type CreateCandidate = {
    line: number;
    name: string;
    category?: string;
    description?: string;
    variant: CreateVariantInput;
  };
  const createCandidates: CreateCandidate[] = [];

  for (const row of rows) {
    const productName = row.productName.trim();
    const variantName = row.variantName.trim();
    const sku = row.sku.trim();
    const variantGroup = row.variantGroup.trim();
    const barcode = row.barcode.trim();
    const fieldErrors: Partial<Record<ProductImportField, string>> = {};
    let message: string | null = null;

    const matched = sku ? context.existingVariantsBySku.get(sku) : undefined;

    if (matched) {
      // UPDATE — patch only the non-blank editable cells.
      const price = parseNumber(row.price, MAX_MONEY, false);
      const cost = parseNumber(row.cost, MAX_MONEY, false);
      if (price.error) fieldErrors.price = price.error;
      if (cost.error) fieldErrors.cost = cost.error;
      if (variantName.length > MAX_NAME) fieldErrors.variantName = 'Terlalu panjang';
      if (variantGroup.length > MAX_GROUP) fieldErrors.variantGroup = 'Terlalu panjang';
      if (barcode.length > MAX_BARCODE) message = 'Barcode terlalu panjang.';

      const base = {
        line: row.line,
        resolvedSku: sku,
        skuGenerated: false,
        productName,
        variantName,
      };

      if (Object.keys(fieldErrors).length > 0 || message) {
        resultByLine.set(row.line, { ...base, status: 'error', fieldErrors, message });
        continue;
      }

      const input: UpdateVariantDetailsInput = {};
      if (variantName) input.name = variantName;
      if (variantGroup) input.variantGroup = variantGroup;
      if (barcode) input.barcode = barcode;
      if (price.value !== undefined) input.price = price.value;
      if (cost.value !== undefined) input.cost = cost.value;

      if (Object.keys(input).length === 0) {
        resultByLine.set(row.line, {
          ...base,
          status: 'skip',
          fieldErrors,
          message: 'Tidak ada kolom untuk diperbarui.',
        });
        continue;
      }

      updates.push({ line: row.line, variantId: matched.variantId, input });
      resultByLine.set(row.line, { ...base, status: 'update', fieldErrors, message: null });
      continue;
    }

    // CREATE — validate the required fields for a brand-new variant.
    const price = parseNumber(row.price, MAX_MONEY, false);
    const cost = parseNumber(row.cost, MAX_MONEY, false);
    const stock = parseNumber(row.stock, MAX_STOCK, true);
    if (!productName) fieldErrors.productName = 'Wajib diisi';
    else if (productName.length > MAX_NAME) fieldErrors.productName = 'Terlalu panjang';
    if (!variantName) fieldErrors.variantName = 'Wajib diisi';
    else if (variantName.length > MAX_NAME) fieldErrors.variantName = 'Terlalu panjang';
    if (variantGroup.length > MAX_GROUP) fieldErrors.variantGroup = 'Terlalu panjang';
    if (barcode.length > MAX_BARCODE) message = 'Barcode terlalu panjang.';
    if (row.price.trim() === '') fieldErrors.price = 'Wajib diisi';
    else if (price.error) fieldErrors.price = price.error;
    if (cost.error) fieldErrors.cost = cost.error;
    if (stock.error) fieldErrors.stock = stock.error;
    if (sku && sku.length > MAX_SKU) fieldErrors.sku = 'Maks 64 karakter';
    else if (sku && usedSkus.has(sku)) fieldErrors.sku = 'Duplikat di file atau sudah dipakai';

    if (Object.keys(fieldErrors).length > 0 || message) {
      resultByLine.set(row.line, {
        line: row.line,
        status: 'error',
        resolvedSku: sku || null,
        skuGenerated: false,
        productName,
        variantName,
        fieldErrors,
        message,
      });
      continue;
    }

    const skuGenerated = sku === '';
    let finalSku: string;
    if (sku) {
      usedSkus.add(sku);
      finalSku = sku;
    } else {
      finalSku = uniqueSku(suggestVariantSku(productName, variantName), usedSkus);
    }

    const variant: CreateVariantInput = {
      sku: finalSku,
      name: variantName,
      variantGroup: variantGroup || undefined,
      barcode: barcode || undefined,
      price: price.value ?? 0,
      cost: cost.value,
      lowStockThreshold: 0,
      alertEnabled: true,
      initialStock: stock.value ?? 0,
    };

    createCandidates.push({
      line: row.line,
      name: productName,
      category: row.category.trim() || undefined,
      description: row.description.trim() || undefined,
      variant,
    });
    resultByLine.set(row.line, {
      line: row.line,
      status: 'create',
      resolvedSku: finalSku,
      skuGenerated,
      productName,
      variantName,
      fieldErrors: {},
      message: null,
    });
  }

  // Group create rows by product name and route each group.
  const createGroups: CreateGroup[] = [];
  const byName = new Map<string, CreateCandidate[]>();
  for (const candidate of createCandidates) {
    const list = byName.get(candidate.name) ?? [];
    list.push(candidate);
    byName.set(candidate.name, list);
  }

  for (const [name, candidates] of byName) {
    const productIds = context.existingProductIdsByName.get(name) ?? [];
    if (productIds.length >= 2) {
      for (const candidate of candidates) {
        const previous = resultByLine.get(candidate.line);
        if (previous) {
          resultByLine.set(candidate.line, {
            ...previous,
            status: 'error',
            fieldErrors: {
              ...previous.fieldErrors,
              productName: 'Nama produk ambigu (ada beberapa produk)',
            },
          });
        }
      }
      continue;
    }

    createGroups.push({
      lines: candidates.map((candidate) => candidate.line),
      targetProductId: productIds[0] ?? null,
      name,
      category: candidates.find((candidate) => candidate.category)?.category,
      description: candidates.find((candidate) => candidate.description)?.description,
      variants: candidates.map((candidate) => candidate.variant),
    });
  }

  const orderedRows = rows.map(
    (row) =>
      resultByLine.get(row.line) ?? {
        line: row.line,
        status: 'error' as const,
        resolvedSku: null,
        skuGenerated: false,
        productName: row.productName.trim(),
        variantName: row.variantName.trim(),
        fieldErrors: {},
        message: 'Baris tidak dapat diproses.',
      },
  );
  const summary: ProductImportSummary = {
    create: orderedRows.filter((row) => row.status === 'create').length,
    update: orderedRows.filter((row) => row.status === 'update').length,
    skip: orderedRows.filter((row) => row.status === 'skip').length,
    error: orderedRows.filter((row) => row.status === 'error').length,
    total: orderedRows.length,
  };

  return { rows: orderedRows, createGroups, updates, summary };
}
