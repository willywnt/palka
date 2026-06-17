import { buildShopeeStockUpdateBody } from '@falka/marketplace-providers';
import { describe, expect, it } from 'vitest';

/**
 * Pins the Shopee /api/v2/product/update_stock body — the ABSOLUTE sellable stock the
 * worker ships via `seller_stock` (which superseded the deprecated `normal_stock`).
 * A no-variation item uses model_id 0. With a syncWarehouseCode set, write ONLY that
 * location_id and omit the rest (non-destructive, like the Lazada sync warehouse).
 */
describe('buildShopeeStockUpdateBody', () => {
  it('emits item_id + model_id + single seller_stock entry (no location) by default', () => {
    expect(
      buildShopeeStockUpdateBody({
        externalProductId: '3744623870',
        externalVariantId: '116272301497',
        quantity: 5,
      }),
    ).toEqual({
      item_id: 3744623870,
      stock_list: [{ model_id: 116272301497, seller_stock: [{ stock: 5 }] }],
    });
  });

  it('targets ONLY the sync warehouse via location_id when configured', () => {
    expect(
      buildShopeeStockUpdateBody({
        externalProductId: '3744623870',
        externalVariantId: '116272301497',
        quantity: 12,
        syncWarehouseCode: 'IDZ',
      }),
    ).toEqual({
      item_id: 3744623870,
      stock_list: [{ model_id: 116272301497, seller_stock: [{ location_id: 'IDZ', stock: 12 }] }],
    });
  });

  it('uses model_id 0 for a no-variation item (missing/blank variant id)', () => {
    expect(buildShopeeStockUpdateBody({ externalProductId: '3744623870', quantity: 0 })).toEqual({
      item_id: 3744623870,
      stock_list: [{ model_id: 0, seller_stock: [{ stock: 0 }] }],
    });
  });

  it('treats a blank/whitespace syncWarehouseCode as unset (no location_id)', () => {
    expect(
      buildShopeeStockUpdateBody({
        externalProductId: '1',
        externalVariantId: '2',
        quantity: 7,
        syncWarehouseCode: '   ',
      }),
    ).toEqual({ item_id: 1, stock_list: [{ model_id: 2, seller_stock: [{ stock: 7 }] }] });
  });

  it('coerces non-numeric ids to 0 rather than NaN', () => {
    expect(buildShopeeStockUpdateBody({ externalProductId: 'not-a-number', quantity: 3 })).toEqual({
      item_id: 0,
      stock_list: [{ model_id: 0, seller_stock: [{ stock: 3 }] }],
    });
  });
});
