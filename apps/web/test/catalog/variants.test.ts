import { describe, expect, it } from 'vitest';

import {
  buildVariantBlocks,
  suggestVariantSku,
  variantBlockToLeaves,
  variantBlocksToLeaves,
} from '@/modules/catalog/utils/variants';

describe('buildVariantBlocks', () => {
  it('renders standalone variants (variantGroup null) as single blocks', () => {
    const blocks = buildVariantBlocks([
      { id: 'a', variantGroup: null },
      { id: 'b', variantGroup: null },
    ]);

    expect(blocks).toEqual([
      { kind: 'single', variant: { id: 'a', variantGroup: null } },
      { kind: 'single', variant: { id: 'b', variantGroup: null } },
    ]);
  });

  it('collapses subvariants sharing a group at the group first-seen position', () => {
    const blocks = buildVariantBlocks([
      { id: 'std', variantGroup: null },
      { id: 'blk', variantGroup: 'iPhone 16' },
      { id: 'wht', variantGroup: 'iPhone 16' },
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ kind: 'single', variant: { id: 'std', variantGroup: null } });

    const group = blocks[1];
    expect(group?.kind).toBe('group');
    if (group?.kind === 'group') {
      expect(group.name).toBe('iPhone 16');
      expect(group.variants.map((variant) => variant.id)).toEqual(['blk', 'wht']);
    }
  });

  it('routes a later mention of a group back into its original block', () => {
    const blocks = buildVariantBlocks([
      { id: 'a', variantGroup: 'G1' },
      { id: 'b', variantGroup: 'G2' },
      { id: 'c', variantGroup: 'G1' },
    ]);

    expect(blocks.map((block) => (block.kind === 'group' ? block.name : 'single'))).toEqual([
      'G1',
      'G2',
    ]);

    const g1 = blocks[0];
    if (g1?.kind === 'group') expect(g1.variants.map((variant) => variant.id)).toEqual(['a', 'c']);
  });
});

describe('suggestVariantSku', () => {
  it('slugs and joins parts into an uppercase SKU', () => {
    expect(suggestVariantSku('iPhone', '16', 'Hitam')).toBe('IPHONE-16-HITAM');
    expect(suggestVariantSku('Kaos Polos', 'Black', 'M')).toBe('KAOS-POLOS-BLACK-M');
  });

  it('drops empty segments and odd separators', () => {
    expect(suggestVariantSku('iPhone', '', ' 128 GB ')).toBe('IPHONE-128-GB');
  });
});

describe('variantBlockToLeaves', () => {
  it('builds a single standalone leaf when hasOptions is off', () => {
    const payload = variantBlockToLeaves({
      variantName: 'iPhone 16',
      hasOptions: false,
      single: {
        sku: 'iphone-16',
        price: 15_000_000,
        cost: 0,
        initialStock: 5,
        lowStockThreshold: 2,
      },
      subvariants: [],
    });

    expect(payload).toEqual([
      {
        sku: 'iphone-16',
        name: 'iPhone 16',
        variantGroup: undefined,
        price: 15_000_000,
        cost: undefined,
        lowStockThreshold: 2,
        alertEnabled: true,
        initialStock: 5,
      },
    ]);
  });

  it('builds one grouped leaf per subvariant when hasOptions is on', () => {
    const payload = variantBlockToLeaves({
      variantName: 'iPhone 16',
      hasOptions: true,
      single: { sku: '', price: 0, cost: 0, initialStock: 0, lowStockThreshold: 0 },
      subvariants: [
        {
          name: 'Hitam',
          sku: 'IPH16-BLK',
          price: 15_000_000,
          cost: 12_000_000,
          initialStock: 5,
          lowStockThreshold: 1,
        },
        {
          name: 'Putih',
          sku: 'IPH16-WHT',
          price: 15_000_000,
          cost: 12_000_000,
          initialStock: 3,
          lowStockThreshold: 1,
        },
      ],
    });

    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({
      name: 'Hitam',
      variantGroup: 'iPhone 16',
      sku: 'IPH16-BLK',
      cost: 12_000_000,
    });
    expect(payload[1]).toMatchObject({
      name: 'Putih',
      variantGroup: 'iPhone 16',
      sku: 'IPH16-WHT',
    });
  });

  it('treats cost 0 as unset', () => {
    const [leaf] = variantBlockToLeaves({
      variantName: 'Tee',
      hasOptions: false,
      single: { sku: 'TEE', price: 100, cost: 0, initialStock: 0, lowStockThreshold: 0 },
      subvariants: [],
    });

    expect(leaf?.cost).toBeUndefined();
  });
});

describe('variantBlocksToLeaves', () => {
  it('flattens multiple blocks (standalone + grouped) into a flat leaf list', () => {
    const leaves = variantBlocksToLeaves([
      {
        variantName: 'iPhone 15',
        hasOptions: false,
        single: { sku: 'IPH15', price: 10, cost: 0, initialStock: 1, lowStockThreshold: 0 },
        subvariants: [],
      },
      {
        variantName: 'iPhone 16',
        hasOptions: true,
        single: { sku: '', price: 0, cost: 0, initialStock: 0, lowStockThreshold: 0 },
        subvariants: [
          {
            name: 'Hitam',
            sku: 'IPH16-BLK',
            price: 15,
            cost: 0,
            initialStock: 2,
            lowStockThreshold: 0,
          },
          {
            name: 'Putih',
            sku: 'IPH16-WHT',
            price: 15,
            cost: 0,
            initialStock: 3,
            lowStockThreshold: 0,
          },
        ],
      },
    ]);

    expect(leaves.map((leaf) => [leaf.name, leaf.variantGroup])).toEqual([
      ['iPhone 15', undefined],
      ['Hitam', 'iPhone 16'],
      ['Putih', 'iPhone 16'],
    ]);
  });
});
