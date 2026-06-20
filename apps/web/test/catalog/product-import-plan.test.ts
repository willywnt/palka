import { describe, expect, it } from 'vitest';

import type { RawProductRow } from '@/modules/catalog/utils/parse-products-csv';
import {
  planProductImport,
  type ImportPlanContext,
} from '@/modules/catalog/utils/product-import-plan';

function row(partial: Partial<RawProductRow> & { line: number }): RawProductRow {
  return {
    productName: '',
    category: '',
    description: '',
    variantGroup: '',
    variantName: '',
    sku: '',
    barcode: '',
    price: '',
    cost: '',
    stock: '',
    ...partial,
  };
}

function ctx(overrides: Partial<ImportPlanContext> = {}): ImportPlanContext {
  return {
    existingVariantsBySku: new Map(),
    existingProductIdsByName: new Map(),
    ...overrides,
  };
}

describe('planProductImport', () => {
  it('creates a new product + variant for an unknown SKU and seeds stock', () => {
    const plan = planProductImport(
      [
        row({
          line: 2,
          productName: 'Kaos',
          variantName: 'Merah',
          sku: 'KAOS-M',
          price: '50000',
          cost: '30000',
          stock: '7',
        }),
      ],
      ctx(),
    );

    expect(plan.summary).toMatchObject({ create: 1, update: 0, skip: 0, error: 0 });
    expect(plan.createGroups).toHaveLength(1);
    expect(plan.createGroups[0]?.targetProductId).toBeNull();
    expect(plan.createGroups[0]?.name).toBe('Kaos');
    expect(plan.createGroups[0]?.variants[0]).toMatchObject({
      sku: 'KAOS-M',
      name: 'Merah',
      price: 50000,
      cost: 30000,
      initialStock: 7,
    });
    expect(plan.rows[0]).toMatchObject({ resolvedSku: 'KAOS-M', skuGenerated: false });
  });

  it('groups rows sharing a product name into one product', () => {
    const plan = planProductImport(
      [
        row({ line: 2, productName: 'Kaos', variantName: 'Merah', sku: 'K-M', price: '50000' }),
        row({ line: 3, productName: 'Kaos', variantName: 'Biru', sku: 'K-B', price: '50000' }),
      ],
      ctx(),
    );

    expect(plan.createGroups).toHaveLength(1);
    expect(plan.createGroups[0]?.variants).toHaveLength(2);
    expect(plan.summary.create).toBe(2);
  });

  it('adds new variants to an existing product when the name matches exactly one', () => {
    const plan = planProductImport(
      [row({ line: 2, productName: 'Kaos', variantName: 'Hijau', sku: 'K-H', price: '50000' })],
      ctx({ existingProductIdsByName: new Map([['Kaos', ['prod-1']]]) }),
    );

    expect(plan.createGroups[0]?.targetProductId).toBe('prod-1');
  });

  it('updates an existing variant by SKU, patches only provided fields, and ignores stock', () => {
    const plan = planProductImport(
      [
        row({
          line: 2,
          productName: 'Kaos',
          variantName: 'Merah',
          sku: 'K-M',
          price: '60000',
          stock: '99',
        }),
      ],
      ctx({ existingVariantsBySku: new Map([['K-M', { variantId: 'v1', productId: 'p1' }]]) }),
    );

    expect(plan.summary).toMatchObject({ create: 0, update: 1, error: 0 });
    expect(plan.rows[0]?.status).toBe('update');
    expect(plan.updates[0]).toMatchObject({
      variantId: 'v1',
      input: { name: 'Merah', price: 60000 },
    });
    expect(plan.updates[0]?.input).not.toHaveProperty('cost'); // blank → unchanged
  });

  it('skips an existing SKU row that has nothing to update', () => {
    const plan = planProductImport(
      [row({ line: 2, sku: 'K-M' })],
      ctx({ existingVariantsBySku: new Map([['K-M', { variantId: 'v1', productId: 'p1' }]]) }),
    );

    expect(plan.summary.skip).toBe(1);
    expect(plan.updates).toHaveLength(0);
  });

  it('errors a new row missing the required price', () => {
    const plan = planProductImport(
      [row({ line: 2, productName: 'Kaos', variantName: 'Merah', sku: 'K-X' })],
      ctx(),
    );

    expect(plan.summary.error).toBe(1);
    expect(plan.rows[0]?.fieldErrors.price).toMatch(/Wajib/);
  });

  it('auto-generates unique SKUs when blank and flags them', () => {
    const plan = planProductImport(
      [
        row({ line: 2, productName: 'iPhone 16', variantName: 'Hitam', price: '1000' }),
        row({ line: 3, productName: 'iPhone 16', variantName: 'Hitam', price: '1000' }),
      ],
      ctx(),
    );

    const skus = plan.createGroups.flatMap((group) => group.variants.map((variant) => variant.sku));
    expect(skus).toHaveLength(2);
    expect(new Set(skus).size).toBe(2);
    expect(plan.rows[0]?.skuGenerated).toBe(true);
    expect(plan.rows[0]?.resolvedSku).toBeTruthy();
  });

  it('flags a duplicate SKU within the file', () => {
    const plan = planProductImport(
      [
        row({ line: 2, productName: 'A', variantName: 'x', sku: 'DUP', price: '1' }),
        row({ line: 3, productName: 'B', variantName: 'y', sku: 'DUP', price: '1' }),
      ],
      ctx(),
    );

    expect(plan.summary).toMatchObject({ create: 1, error: 1 });
    expect(plan.rows[1]?.fieldErrors.sku).toMatch(/duplikat/i);
  });

  it('errors create rows when the product name is ambiguous (≥2 live products)', () => {
    const plan = planProductImport(
      [row({ line: 2, productName: 'Kaos', variantName: 'Merah', sku: 'K-Z', price: '1' })],
      ctx({ existingProductIdsByName: new Map([['Kaos', ['p1', 'p2']]]) }),
    );

    expect(plan.summary.error).toBe(1);
    expect(plan.createGroups).toHaveLength(0);
    expect(plan.rows[0]?.fieldErrors.productName).toMatch(/ambigu|beberapa/i);
  });

  it('rejects a non-numeric price on a new row', () => {
    const plan = planProductImport(
      [row({ line: 2, productName: 'A', variantName: 'x', sku: 'A1', price: 'abc' })],
      ctx(),
    );

    expect(plan.summary.error).toBe(1);
    expect(plan.rows[0]?.fieldErrors.price).toMatch(/Bukan angka/);
  });
});
