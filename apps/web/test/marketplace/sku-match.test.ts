import { describe, expect, it } from 'vitest';

import {
  buildVariantSkuIndex,
  matchSku,
  normalizeSkuCompact,
  skuTokenSetKey,
} from '@/modules/marketplace/utils/sku-match';

describe('normalizeSkuCompact', () => {
  it('ignores case and separators', () => {
    expect(normalizeSkuCompact('KAOS-BLK-M')).toBe('KAOSBLKM');
    expect(normalizeSkuCompact('kaos_blk_m')).toBe('KAOSBLKM');
    expect(normalizeSkuCompact(' KAOS BLK M ')).toBe('KAOSBLKM');
    expect(normalizeSkuCompact('kaos.blk/m')).toBe('KAOSBLKM');
  });
});

describe('skuTokenSetKey', () => {
  it('is order-insensitive', () => {
    expect(skuTokenSetKey('KAOS-BLK-M')).toBe('BLK|KAOS|M');
    expect(skuTokenSetKey('BLK-KAOS-M')).toBe('BLK|KAOS|M');
    expect(skuTokenSetKey('m kaos blk')).toBe('BLK|KAOS|M');
  });
});

describe('matchSku', () => {
  const index = buildVariantSkuIndex([
    { id: 'v-m', sku: 'KAOS-BLK-M' },
    { id: 'v-l', sku: 'KAOS-BLK-L' },
    { id: 'v-tote', sku: 'TOTE-NAT' },
  ]);

  it('matches an identical SKU as EXACT', () => {
    expect(matchSku('KAOS-BLK-M', index)).toEqual({ variantId: 'v-m', quality: 'EXACT' });
  });

  it('matches case/separator differences as NORMALIZED', () => {
    expect(matchSku('kaos_blk_m', index)).toEqual({ variantId: 'v-m', quality: 'NORMALIZED' });
    expect(matchSku('KAOSBLKM', index)).toEqual({ variantId: 'v-m', quality: 'NORMALIZED' });
  });

  it('matches reordered tokens as NORMALIZED', () => {
    expect(matchSku('BLK-KAOS-M', index)).toEqual({ variantId: 'v-m', quality: 'NORMALIZED' });
  });

  it('does NOT merge a different size (the critical safety case)', () => {
    // KAOS-BLK-M vs KAOS-BLK-L differ by one char but are different variants.
    expect(matchSku('KAOS-BLK-XL', index)).toBeNull();
    expect(matchSku('KAOS-BLK', index)).toBeNull();
  });

  it('returns null for an unknown SKU', () => {
    expect(matchSku('SOMETHING-ELSE', index)).toBeNull();
  });

  it('refuses an ambiguous key shared by two variants', () => {
    const ambiguous = buildVariantSkuIndex([
      { id: 'a', sku: 'KAOS-BLK-M' },
      { id: 'b', sku: 'KAOS_BLK_M' },
    ]);
    // Exact raw still resolves to the right variant...
    expect(matchSku('KAOS-BLK-M', ambiguous)).toEqual({ variantId: 'a', quality: 'EXACT' });
    // ...but a non-exact form collides on both keys, so it is left for manual mapping.
    expect(matchSku('kaos blk m', ambiguous)).toBeNull();
  });
});
