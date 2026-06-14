import { buildLazadaQuantityPayload } from '@falka/marketplace-providers';
import { describe, expect, it } from 'vitest';

/**
 * Pins the LazOP /product/price_quantity/update payload — the exact XML the worker ships
 * and the dev verification script sends. Lazada deprecated SellerSku for this endpoint, so
 * we key by ItemId + SkuId when present and only fall back to SellerSku otherwise.
 */
describe('buildLazadaQuantityPayload', () => {
  it('keys by ItemId + SkuId when present (SellerSku is deprecated for this API)', () => {
    expect(
      buildLazadaQuantityPayload({
        externalSku: 'TEST-SKU-01',
        externalProductId: '18857564074',
        externalVariantId: '116272301497',
        quantity: 5,
      }),
    ).toBe(
      '<Request><Product><Skus><Sku><ItemId>18857564074</ItemId><SkuId>116272301497</SkuId><Quantity>5</Quantity></Sku></Skus></Product></Request>',
    );
  });

  it('falls back to SellerSku only when item/sku ids are missing', () => {
    expect(buildLazadaQuantityPayload({ externalSku: 'TEST-SKU-01', quantity: 0 })).toBe(
      '<Request><Product><Skus><Sku><SellerSku>TEST-SKU-01</SellerSku><Quantity>0</Quantity></Sku></Skus></Product></Request>',
    );
  });

  it('escapes XML metacharacters in the fallback SKU', () => {
    expect(buildLazadaQuantityPayload({ externalSku: 'A&B<C>', quantity: 1 })).toContain(
      '<SellerSku>A&amp;B&lt;C&gt;</SellerSku>',
    );
  });
});
